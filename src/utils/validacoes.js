// Validações obrigatórias
export const validarCamposObrigatorios = (dados) => {
  const erros = [];

  if (!dados.cliente || dados.cliente.trim() === '') {
    erros.push('Cliente é obrigatório');
  }

  if (!dados.tipoAtendimento) {
    erros.push('Tipo de atendimento é obrigatório');
  }

  if (!dados.tensaoKv || dados.tensaoKv <= 0) {
    erros.push('Tensão deve ser maior que zero');
  }

  if (!dados.demandaFutura || dados.demandaFutura <= 0) {
    erros.push('Carga futura é obrigatória e deve ser maior que zero');
  }

  if (!dados.municipio || dados.municipio.trim() === '') {
    erros.push('Município é obrigatório');
  }

  return erros;
};

// Validações matemáticas
export const validarConsistenciaMatematica = (dados) => {
  const erros = [];
  const avisos = [];

  // Carga futura >= carga atual
  if (dados.demandaFutura < (dados.cargaAtual || 0)) {
    erros.push('Carga futura não pode ser menor que carga atual');
  }

  // Valores não negativos
  if (dados.ctTotal < 0) {
    erros.push('Total de CT não pode ser negativo');
  }

  if (dados.ppTotal < 0) {
    erros.push('Total de PP não pode ser negativo');
  }

  if (dados.erd < 0) {
    erros.push('Valor de ERD não pode ser negativo');
  }

  // PFC negativo (aviso)
  const pfc = dados.totalObra - dados.ctTotal - dados.ppTotal - (dados.erd || 0);
  if (pfc < 0) {
    avisos.push('PFC do cliente está negativo. Verifique os valores de CT, PP e ERD.');
  }

  // CT + PP + ERD > Total da obra (aviso)
  if ((dados.ctTotal + dados.ppTotal + (dados.erd || 0)) > dados.totalObra) {
    avisos.push('A soma de CT + PP + ERD é maior que o total da obra');
  }

  return { erros, avisos };
};

// Validação de itens de obra
export const validarItensObra = (itens) => {
  const erros = [];

  if (!itens || itens.length === 0) {
    erros.push('Adicione pelo menos um item de obra');
  }

  itens.forEach((item, index) => {
    if (!item.descricao || item.descricao.trim() === '') {
      erros.push(`Item ${index + 1}: descrição é obrigatória`);
    }
    if (!item.valor || item.valor <= 0) {
      erros.push(`Item ${index + 1}: valor deve ser maior que zero`);
    }
  });

  return erros;
};