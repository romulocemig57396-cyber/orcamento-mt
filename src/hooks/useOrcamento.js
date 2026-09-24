import { useState, useEffect } from 'react';
import {
  calcularMUSD,
  calcularValidade,
  calcularPrazoEstimado,
  calcularRateioERD,
  calcularTotaisItens
} from '../utils/calculos';

const STORAGE_KEY = 'orcamento_mt_app';

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
  materiaisAuxiliares: [],
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
  dataBase: new Date(),
  dataValidade: new Date(),
  dataEstudo: '',
  importacao: {
    textoOriginal: '',
    cabecalhoDetectado: null,
    itensDetectados: [],
    textosAltaTensao: [],
    textoAltaTensao: '',
    analisado: false,
  },
  obrasVinculadas: {
    temObrasVinculadas: false,
    descricao: '',
    dataConclusao: '',
    diasRestantes: null,
  },
  temObrasVinculadas: false,
  dataObrasVinculadas: '',
  diasObrasVinculadas: null,
  prazoEstimado: null,
};

export const useOrcamento = () => {
  const [orcamento, setOrcamento] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          dataBase: new Date(parsed.dataBase),
          dataValidade: new Date(parsed.dataValidade),
          importacao: parsed.importacao || initialState.importacao,
          obrasVinculadas: parsed.obrasVinculadas || initialState.obrasVinculadas,
        };
      } catch (e) {
        console.error('Erro ao carregar dados salvos:', e);
        return initialState;
      }
    }
    return initialState;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orcamento));
  }, [orcamento]);

  useEffect(() => {
    const hoje = new Date();
    const conclusao = new Date(orcamento.dataObrasVinculadas);
    const diff = Math.ceil((conclusao - hoje) / (1000 * 60 * 60 * 24));
    const diasObrasVinculadas = isNaN(diff) ? null : diff;

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

  const updateObrasVinculadas = (updates) => {
    setOrcamento(prev => ({ ...prev, obrasVinculadas: { ...prev.obrasVinculadas, ...updates } }));
  };

  const resetOrcamento = () => {
    setOrcamento(initialState);
    localStorage.removeItem(STORAGE_KEY);
  };

  return {
    orcamento,
    updateField,
    updateImportacao,
    updateObrasVinculadas,
    resetOrcamento,
    setOrcamento
  };
};
