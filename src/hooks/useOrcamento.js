import { useState, useEffect } from 'react';
import {
  calcularMUSD,
  calcularPostes,
  calcularValidade
} from '../utils/calculos';

const STORAGE_KEY = 'orcamento_mt_app';

const initialState = {
  cliente: '',
  tipoAtendimento: '',
  tensaoKv: '',
  cargaAtual: 0,
  cargaFutura: '',
  municipio: '',
  localUnidade: '',
  coordenadaInicial: '',
  coordenadaFinal: '',
  extensaoRede: '',
  tipoRede: '',
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
  pfcCliente: 0,
  parcelaD: 0,
  material: 0,
  servicos: 0,
  administracao: 0,
  valorTotal: 0,
  quantidadePostes: 0,
  dataBase: new Date(),
  dataValidade: new Date(),
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
          dataValidade: new Date(parsed.dataValidade)
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
    // Total da Obra = soma de todos os itens
    const totalObra = orcamento.itensObra.reduce((acc, item) => acc + (parseFloat(item.valor) || 0), 0);
    
    // CTC (Condição Técnica CEMIG) = itens CTC + Diferença de Cabo
    const ctcTotal = orcamento.itensObra
      .filter(item => item.categoria === 'ctc')
      .reduce((acc, item) => acc + (parseFloat(item.valor) || 0), 0)
      + (parseFloat(orcamento.diferencaCabo) || 0);
    
    // PP = soma (valor × %CEMIG) dos itens PP
    const ppTotal = orcamento.itensObra
      .filter(item => item.categoria === 'pp')
      .reduce((acc, item) => {
        const valor = parseFloat(item.valor) || 0;
        const percentualCemig = parseFloat(item.percentualCemig) || 0;
        return acc + (valor * percentualCemig / 100);
      }, 0);
    
    // Parcela Regulatória Total = itens Parcela Reg + parte cliente dos itens PP
    const parcelaRegTotal = 
      orcamento.itensObra
        .filter(item => item.categoria === 'parcela_reg')
        .reduce((acc, item) => acc + (parseFloat(item.valor) || 0), 0)
      + orcamento.itensObra
        .filter(item => item.categoria === 'pp')
        .reduce((acc, item) => {
          const valor = parseFloat(item.valor) || 0;
          const percentualCemig = parseFloat(item.percentualCemig) || 0;
          const percentualCliente = 100 - percentualCemig;
          return acc + (valor * percentualCliente / 100);
        }, 0);
    
    // Coberto pelo ERD
    const erdValue = parseFloat(orcamento.erd) || 0;
    const parcelaRegCobertaERD = Math.min(erdValue, parcelaRegTotal);
    
    // Sobra da Parcela Regulatória
    const sobraParcelaReg = Math.max(0, parcelaRegTotal - erdValue);
    
    // PFC Cliente = itens CTI + Sobra Parcela Reg
    const ctiTotal = orcamento.itensObra
      .filter(item => item.categoria === 'cti')
      .reduce((acc, item) => acc + (parseFloat(item.valor) || 0), 0);
    
   // PFC Cliente = Total Obra - CTC - PP - ERD coberto
    const pfcCliente = totalObra - ctcTotal - ppTotal - parcelaRegCobertaERD;
    
    // Parcela D = CTC + PP
    const parcelaD = ctcTotal + ppTotal;
    
    // Material e Serviços (60% / 40%)
    const material = totalObra * 0.60;
    const servicos = totalObra * 0.40;
    
    // Valor Total Final
    const valorTotal = (parseFloat(orcamento.administracao) || 0) + material + servicos;
    
    // Outros cálculos
    const musd = calcularMUSD(orcamento.cargaFutura, orcamento.cargaAtual);
    const quantidadePostes = calcularPostes(orcamento.extensaoRede);
    const dataValidade = calcularValidade(orcamento.dataBase);

    if (
      orcamento.musd !== musd ||
      orcamento.totalObra !== totalObra ||
      orcamento.ctcTotal !== ctcTotal ||
      orcamento.ppTotal !== ppTotal ||
      orcamento.parcelaRegTotal !== parcelaRegTotal ||
      orcamento.parcelaRegCobertaERD !== parcelaRegCobertaERD ||
      orcamento.sobraParcelaReg !== sobraParcelaReg ||
      orcamento.pfcCliente !== pfcCliente ||
      orcamento.parcelaD !== parcelaD ||
      orcamento.material !== material ||
      orcamento.servicos !== servicos ||
      orcamento.valorTotal !== valorTotal ||
      orcamento.quantidadePostes !== quantidadePostes
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
        pfcCliente,
        parcelaD,
        material,
        servicos,
        valorTotal,
        quantidadePostes,
        dataValidade
      }));
    }
  }, [
    orcamento.cargaFutura,
    orcamento.cargaAtual,
    orcamento.itensObra,
    orcamento.diferencaCabo,
    orcamento.erd,
    orcamento.administracao,
    orcamento.extensaoRede,
    orcamento.dataBase
  ]);

  const updateField = (field, value) => {
    setOrcamento(prev => ({ ...prev, [field]: value }));
  };

  const resetOrcamento = () => {
    setOrcamento(initialState);
    localStorage.removeItem(STORAGE_KEY);
  };

  return {
    orcamento,
    updateField,
    resetOrcamento,
    setOrcamento
  };
};