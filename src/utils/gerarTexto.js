export const gerarMemorialDescritivo = (dados) => {
  const tipoAtendimentoTexto = {
    'LN': 'Ligação Nova',
    'AC': 'Aumento de Carga',
    'RF': 'Reforma',
  };

  const tipoRedeTexto = {
    'trifasica_convencional': 'trifásica convencional',
    'trifasica_compacta': 'trifásica compacta',
    'monofasica': 'monofásica',
  };

  const texto = `
MEMORIAL DESCRITIVO TÉCNICO

Cliente: ${dados.cliente}
Tipo de Atendimento: ${tipoAtendimentoTexto[dados.tipoAtendimento] || dados.tipoAtendimento}
Demanda: ${dados.cargaFutura} kW
Tensão: ${dados.tensaoKv} kV
Local: ${dados.localUnidade}
Município: ${dados.municipio}

Para atendimento da unidade consumidora em ${dados.municipio}, localizada em ${dados.localUnidade}, com demanda de ${dados.cargaFutura} kW em tensão de ${dados.tensaoKv} kV, serão necessárias as seguintes obras:

EXTENSÃO DE REDE: ${dados.extensaoRede || 0} metros de rede ${tipoRedeTexto[dados.tipoRede] || dados.tipoRede || 'trifásica'}.

${dados.coordenadaInicial ? `COORDENADAS INICIAL: ${dados.coordenadaInicial}` : ''}
${dados.coordenadaFinal ? `COORDENADAS FINAL: ${dados.coordenadaFinal}` : ''}

As obras descritas neste orçamento são de responsabilidade do cliente/interessado conforme legislação vigente.

As obras de responsabilidade da Cemig (quando aplicáveis) incluem adequações na rede de média tensão existente e serão executadas conforme planejamento técnico da concessionária.

${dados.observacoes ? '\nOBSERVAÇÕES ADICIONAIS:\n' + dados.observacoes : ''}
  `.trim();

  return texto;
};

export const gerarTextoResumoFinanceiro = (dados) => {
  return `
RESUMO FINANCEIRO

Total da Obra: ${formatarMoeda(dados.totalObra)}
Material Requisitado (60%): ${formatarMoeda(dados.material)}
Serviços Contratados (40%): ${formatarMoeda(dados.servicos)}
${dados.administracao > 0 ? `Administração/MOP: ${formatarMoeda(dados.administracao)}` : ''}

VALOR TOTAL: ${formatarMoeda(dados.valorTotal)}

RATEIO TÉCNICO:
- Condição Técnica (CT): ${formatarMoeda(dados.ctTotal)}
- Proporcionalidade (PP): ${formatarMoeda(dados.ppTotal)}
- ERD: ${formatarMoeda(dados.erd || 0)}
- Parcela Demanda Regulada Técnica D: ${formatarMoeda(dados.parcelaD)}
- PFC do Cliente: ${formatarMoeda(dados.pfcCliente)}

Validade do Orçamento: ${formatarData(dados.dataValidade)}
Emissão: ${dados.municipio}, ${formatarData(dados.dataBase)}
  `.trim();
};

const formatarMoeda = (valor) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(valor || 0);
};

const formatarData = (data) => {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(data));
};