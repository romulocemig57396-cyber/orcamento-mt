import { useState, useEffect } from 'react';
import {
  calcularMUSD,
  calcularValidade,
  calcularPrazoEstimado,
  calcularRateioERD,
  calcularTotaisItens
} from '../utils/calculos';
import { hojeISO, diasEntre } from '../utils/datas';
import {
  criarClientePersistenciaFront,
  CHAVE_CACHE as STORAGE_KEY,
} from '../persistencia/clienteFront';
import { obterTokenApp } from '../auth/sessaoApp';

// Datas como texto AAAA-MM-DD (ver utils/datas.js)
const initialState = {
  cliente: '',
  ns: '',
  tipoAtendimento: '',
  tensaoKv: '',
  cargaAtual: 0,
  demandaFutura: '',
  municipio: '',
  localUnidade: '',
  observacoes: '',
  itensObra: [],
  diferencaCabo: 0,
  erd: 0,
  erdAplicado: null,
  descricaoTecnica: '',
  musd: 0,
  totalObra: 0,
  ctcTotal: 0,
  ppTotal: 0,
  parcelaRegTotal: 0,
  parcelaRegCobertaERD: 0,
  sobraParcelaReg: 0,
  erdNaoUtilizado: 0,
  diferencaCaboItens: 0,
  diferencaCaboTotal: 0,
  ctiTotal: 0,
  pfcCliente: 0,
  parcelaD: 0,
  material: 0,
  servicos: 0,
  administracao: 0,
  valorTotal: 0,
  dataBase: '',
  dataValidade: '',
  dataEstudo: '',
  importacao: {
    textoOriginal: '',
    cabecalhoDetectado: null,
    itensDetectados: [],
    textosAltaTensao: [],
    textoAltaTensao: '',
    analisado: false,
  },
  temObrasVinculadas: false,
  dataObrasVinculadas: '',
  diasObrasVinculadas: null,
  prazoEstimado: null,
};

// Estado inicial com a Data Base de hoje (calculada na hora, não no carregamento do módulo)
const novoEstado = () => {
  const hoje = hojeISO();
  return { ...initialState, dataBase: hoje, dataValidade: calcularValidade(hoje) };
};

// Cliente de persistência: fala com a API quando configurada e usa o
// localStorage como cache local/offline. Em ambiente local (sem API
// configurada) opera SOMENTE com o localStorage, preservando o comportamento
// atual do app. A configuração vem das variáveis de ambiente do Vite; na
// ausência delas, `baseUrl` fica vazio ⇒ API desabilitada (degradação graciosa).
const lerEnv = (chave) => {
  try {
    return (typeof import.meta !== 'undefined' && import.meta.env)
      ? import.meta.env[chave]
      : undefined;
  } catch {
    return undefined;
  }
};

const clientePadrao = criarClientePersistenciaFront({
  baseUrl: lerEnv('VITE_API_BASE_URL') || '',
  ambiente: lerEnv('VITE_AMBIENTE') || 'dev',
  // Liga o provedor de token da camada de auth (MSAL) ao cliente de
  // persistência: quando a API/Entra estão configurados, as chamadas vão
  // autenticadas (Bearer); sem configuração, `obterTokenApp` devolve null e o
  // cliente opera somente com o localStorage (degradação graciosa).
  obterToken: () => obterTokenApp(),
});

// Dá forma ao estado de orçamento vindo do cliente (datas/importação), ou cria
// um estado novo quando não há nada salvo. O cliente já aplica a migração.
const comporEstado = (dados) => {
  if (dados && typeof dados === 'object') {
    const dataBase = dados.dataBase || hojeISO();
    return {
      ...dados,
      dataBase,
      dataValidade: calcularValidade(dataBase),
      importacao: dados.importacao || initialState.importacao,
    };
  }
  return novoEstado();
};

// Lê o orçamento do cache local de forma síncrona (inicialização do hook).
// A migração de formato é aplicada pelo cliente de persistência.
const carregarSalvo = (cliente = clientePadrao) => {
  try {
    return comporEstado(cliente.carregarCacheSync());
  } catch (e) {
    console.error('Erro ao carregar dados salvos:', e);
    return novoEstado();
  }
};

export const useOrcamento = (cliente = clientePadrao) => {
  const [orcamento, setOrcamento] = useState(() => carregarSalvo(cliente));

  // Outra aba alterou o orçamento: suspende o salvamento automático desta aba
  // até o usuário escolher qual versão fica, para uma não apagar a outra.
  const [salvamentoSuspenso, setSalvamentoSuspenso] = useState(false);

  useEffect(() => {
    const aoAlterarStorage = (e) => {
      if (e.key === STORAGE_KEY || e.key === null) setSalvamentoSuspenso(true);
    };
    window.addEventListener('storage', aoAlterarStorage);
    return () => window.removeEventListener('storage', aoAlterarStorage);
  }, []);

  useEffect(() => {
    if (salvamentoSuspenso) return;
    // Grava via cliente: cache local SEMPRE (síncrono) e, quando a API estiver
    // configurada, sincroniza com o servidor em segundo plano. Em ambiente local
    // isso equivale ao `localStorage.setItem` de antes.
    cliente.salvar(orcamento);
  }, [orcamento, salvamentoSuspenso, cliente]);

  const carregarVersaoOutraAba = () => {
    setOrcamento(carregarSalvo(cliente));
    setSalvamentoSuspenso(false);
  };

  // Retomar o salvamento grava esta versão por cima da outra (efeito acima)
  const manterEstaVersao = () => setSalvamentoSuspenso(false);

  useEffect(() => {
    const diasObrasVinculadas = diasEntre(hojeISO(), orcamento.dataObrasVinculadas);

    if (orcamento.diasObrasVinculadas !== diasObrasVinculadas) {
      setOrcamento(prev => ({ ...prev, diasObrasVinculadas }));
    }
  }, [orcamento.dataObrasVinculadas]);

  useEffect(() => {
    const {
      totalObra, diferencaCaboItens, diferencaCaboTotal,
      ctcTotal, ppTotal, parcelaRegTotal, ctiTotal,
    } = calcularTotaisItens(orcamento.itensObra, orcamento.diferencaCabo);

    const { parcelaRegCobertaERD, sobraParcelaReg, erdNaoUtilizado, pfcCliente } =
      calcularRateioERD({ totalObra, ctcTotal, ppTotal, parcelaRegTotal, erd: orcamento.erd });
    const parcelaD = ctcTotal + ppTotal;

    const material = totalObra * 0.60;
    const servicos = totalObra * 0.40;
    const valorTotal = (parseFloat(orcamento.administracao) || 0) + material + servicos;

    const musd = calcularMUSD(orcamento.demandaFutura, orcamento.cargaAtual);
    const dataValidade = calcularValidade(orcamento.dataBase);
    const prazoEstimado = calcularPrazoEstimado(orcamento);

    if (
      orcamento.musd !== musd ||
      orcamento.totalObra !== totalObra ||
      orcamento.ctcTotal !== ctcTotal ||
      orcamento.ppTotal !== ppTotal ||
      orcamento.parcelaRegTotal !== parcelaRegTotal ||
      orcamento.parcelaRegCobertaERD !== parcelaRegCobertaERD ||
      orcamento.sobraParcelaReg !== sobraParcelaReg ||
      orcamento.erdNaoUtilizado !== erdNaoUtilizado ||
      orcamento.diferencaCaboItens !== diferencaCaboItens ||
      orcamento.diferencaCaboTotal !== diferencaCaboTotal ||
      orcamento.ctiTotal !== ctiTotal ||
      orcamento.pfcCliente !== pfcCliente ||
      orcamento.parcelaD !== parcelaD ||
      orcamento.material !== material ||
      orcamento.servicos !== servicos ||
      orcamento.valorTotal !== valorTotal ||
      orcamento.dataValidade !== dataValidade ||
      orcamento.prazoEstimado?.prazoFinal !== prazoEstimado.prazoFinal ||
      orcamento.prazoEstimado?.prazoRede !== prazoEstimado.prazoRede ||
      orcamento.prazoEstimado?.prazoVinculadas !== prazoEstimado.prazoVinculadas ||
      orcamento.prazoEstimado?.kmTotal !== prazoEstimado.kmTotal ||
      orcamento.prazoEstimado?.temObrasVinculadas !== prazoEstimado.temObrasVinculadas
    ) {
      setOrcamento(prev => ({
        ...prev,
        musd,
        totalObra,
        ctcTotal,
        ppTotal,
        parcelaRegTotal,
        parcelaRegCobertaERD,
        sobraParcelaReg,
        erdNaoUtilizado,
        diferencaCaboItens,
        diferencaCaboTotal,
        ctiTotal,
        pfcCliente,
        parcelaD,
        material,
        servicos,
        valorTotal,
        dataValidade,
        prazoEstimado,
      }));
    }
  }, [
    orcamento.demandaFutura,
    orcamento.cargaAtual,
    orcamento.itensObra,
    orcamento.diferencaCabo,
    orcamento.erd,
    orcamento.administracao,
    orcamento.dataBase,
    orcamento.temObrasVinculadas,
    orcamento.diasObrasVinculadas,
  ]);

  const updateField = (field, value) => {
    setOrcamento(prev => ({ ...prev, [field]: value }));
  };

  const updateImportacao = (updates) => {
    setOrcamento(prev => ({ ...prev, importacao: { ...prev.importacao, ...updates } }));
  };

  const resetOrcamento = () => {
    setOrcamento(novoEstado());
    cliente.remover();
  };

  return {
    orcamento,
    updateField,
    updateImportacao,
    resetOrcamento,
    setOrcamento,
    salvamentoSuspenso,
    carregarVersaoOutraAba,
    manterEstaVersao,
  };
};
