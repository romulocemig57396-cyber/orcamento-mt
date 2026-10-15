import { describe, test, expect } from 'vitest';
import anonimizar, {
  anonimizar as anonimizarFn,
  pseudonimizar,
  ehPseudonimo,
  originadoDeProducao,
  estaAnonimizado,
  usoPermitido,
  assegurarUsoPermitido,
  prepararParaAmbiente,
  ehAmbienteNaoProdutivo,
  PREFIXO_PSEUDONIMO,
  MARCADOR_GENERALIZADO,
  AMBIENTE_PRODUCAO,
} from '../lgpd/anonimizar.js';

const SAL = 'segredo-de-processo-nao-armazenado';

/* Documento de produção no formato do Data Model (design.md). */
const docProducao = () => ({
  id: 'uuid-do-orcamento',
  ambiente: 'prd',
  origemProducao: true,
  versaoSchema: 3,
  proprietarioOid: 'oid-entra-id-12345',
  classificacao: 'interno',
  dados: {
    cliente: 'Fulano de Tal LTDA',
    ns: '5300125572',
    cpf: '123.456.789-00',
    email: 'fulano@empresa.com.br',
    endereco: 'Rua das Flores, 123',
    cep: '30110-000',
    totalObra: 1000,
  },
});

describe('pseudonimizar', () => {
  test('é determinístico para o mesmo valor e sal', () => {
    expect(pseudonimizar('5300125572', SAL)).toBe(pseudonimizar('5300125572', SAL));
  });

  test('produz pseudônimos distintos para valores distintos', () => {
    expect(pseudonimizar('a', SAL)).not.toBe(pseudonimizar('b', SAL));
  });

  test('depende do sal: sais diferentes geram pseudônimos diferentes', () => {
    expect(pseudonimizar('5300125572', SAL)).not.toBe(
      pseudonimizar('5300125572', 'outro-sal')
    );
  });

  test('a saída não contém o valor original', () => {
    const p = pseudonimizar('5300125572', SAL);
    expect(p.startsWith(PREFIXO_PSEUDONIMO)).toBe(true);
    expect(p).not.toContain('5300125572');
    expect(ehPseudonimo(p)).toBe(true);
  });

  test('exige um sal não vazio', () => {
    expect(() => pseudonimizar('x', '')).toThrow();
    expect(() => pseudonimizar('x')).toThrow();
  });
});

describe('anonimizar', () => {
  test('substitui identificadores diretos por pseudônimos irreversíveis', () => {
    const anon = anonimizarFn(docProducao(), { sal: SAL });
    expect(ehPseudonimo(anon.proprietarioOid)).toBe(true);
    expect(ehPseudonimo(anon.dados.cliente)).toBe(true);
    expect(ehPseudonimo(anon.dados.ns)).toBe(true);
    expect(ehPseudonimo(anon.dados.cpf)).toBe(true);
    expect(ehPseudonimo(anon.dados.email)).toBe(true);
  });

  test('a saída não contém nenhum identificador original (não reidentificável)', () => {
    const anon = anonimizarFn(docProducao(), { sal: SAL });
    const serial = JSON.stringify(anon);
    for (const original of [
      'oid-entra-id-12345',
      'Fulano de Tal LTDA',
      '5300125572',
      '123.456.789-00',
      'fulano@empresa.com.br',
      'Rua das Flores, 123',
      '30110-000',
    ]) {
      expect(serial).not.toContain(original);
    }
  });

  test('o sal não vaza na saída anonimizada', () => {
    const anon = anonimizarFn(docProducao(), { sal: SAL });
    expect(JSON.stringify(anon)).not.toContain(SAL);
  });

  test('generaliza quase-identificadores (endereço, cep)', () => {
    const anon = anonimizarFn(docProducao(), { sal: SAL });
    expect(anon.dados.endereco).toBe(MARCADOR_GENERALIZADO);
    expect(anon.dados.cep).toBe(MARCADOR_GENERALIZADO);
  });

  test('preserva campos não identificadores', () => {
    const anon = anonimizarFn(docProducao(), { sal: SAL });
    expect(anon.classificacao).toBe('interno');
    expect(anon.versaoSchema).toBe(3);
    expect(anon.dados.totalObra).toBe(1000);
  });

  test('reescreve a marca de origem e marca como anonimizado', () => {
    const anon = anonimizarFn(docProducao(), { sal: SAL });
    expect(anon.anonimizado).toBe(true);
    expect(anon.origemProducao).toBeUndefined();
    expect(anon.ambiente).not.toBe(AMBIENTE_PRODUCAO);
    expect(originadoDeProducao(anon)).toBe(false);
    expect(estaAnonimizado(anon)).toBe(true);
  });

  test('não muta a entrada original', () => {
    const doc = docProducao();
    anonimizarFn(doc, { sal: SAL });
    expect(doc.proprietarioOid).toBe('oid-entra-id-12345');
    expect(doc.dados.cliente).toBe('Fulano de Tal LTDA');
  });

  test('é idempotente: reanonimizar com o mesmo sal não altera a saída', () => {
    const umaVez = anonimizarFn(docProducao(), { sal: SAL });
    const duasVezes = anonimizarFn(umaVez, { sal: SAL });
    expect(duasVezes).toEqual(umaVez);
  });

  test('preserva integridade referencial: mesmo valor → mesmo pseudônimo', () => {
    const a = anonimizarFn({ cliente: 'ACME', ns: '1' }, { sal: SAL });
    const b = anonimizarFn({ cliente: 'ACME', ns: '2' }, { sal: SAL });
    expect(a.cliente).toBe(b.cliente); // mesmo cliente → mesmo pseudônimo
    expect(a.ns).not.toBe(b.ns); // NS diferentes → pseudônimos diferentes
  });

  test('trata estruturas aninhadas e arrays', () => {
    const anon = anonimizarFn(
      { lista: [{ cpf: '111' }, { cpf: '222' }], cliente: 'X' },
      { sal: SAL }
    );
    expect(ehPseudonimo(anon.lista[0].cpf)).toBe(true);
    expect(ehPseudonimo(anon.lista[1].cpf)).toBe(true);
    expect(anon.lista[0].cpf).not.toBe(anon.lista[1].cpf);
  });

  test('exige sal não vazio', () => {
    expect(() => anonimizarFn(docProducao(), { sal: '' })).toThrow();
    expect(() => anonimizarFn(docProducao(), {})).toThrow();
  });

  test('export default equivale à função nomeada', () => {
    expect(anonimizar(docProducao(), { sal: SAL })).toEqual(
      anonimizarFn(docProducao(), { sal: SAL })
    );
  });
});

describe('guard de uso (R11.3)', () => {
  test('rejeita dado de produção não anonimizado em dev', () => {
    expect(() => assegurarUsoPermitido(docProducao(), 'dev')).toThrow();
    expect(usoPermitido(docProducao(), 'dev')).toBe(false);
  });

  test('rejeita dado de produção não anonimizado em hml', () => {
    expect(() => assegurarUsoPermitido(docProducao(), 'hml')).toThrow();
    expect(usoPermitido(docProducao(), 'hml')).toBe(false);
  });

  test('permite dado de produção anonimizado em dev/hml', () => {
    const anon = anonimizarFn(docProducao(), { sal: SAL });
    expect(() => assegurarUsoPermitido(anon, 'dev')).not.toThrow();
    expect(usoPermitido(anon, 'hml')).toBe(true);
  });

  test('permite dado de produção não anonimizado no próprio produção', () => {
    expect(usoPermitido(docProducao(), 'prd')).toBe(true);
    expect(() => assegurarUsoPermitido(docProducao(), 'prd')).not.toThrow();
  });

  test('permite dado não originado de produção em dev/hml', () => {
    const naoProd = { ambiente: 'dev', dados: { cliente: 'X' } };
    expect(usoPermitido(naoProd, 'dev')).toBe(true);
    expect(() => assegurarUsoPermitido(naoProd, 'dev')).not.toThrow();
  });

  test('reconhece origem de produção por diferentes marcas', () => {
    expect(originadoDeProducao({ origemProducao: true })).toBe(true);
    expect(originadoDeProducao({ origem: 'prd' })).toBe(true);
    expect(originadoDeProducao({ ambiente: 'prd' })).toBe(true);
    expect(originadoDeProducao({ ambiente: 'dev' })).toBe(false);
    expect(originadoDeProducao(null)).toBe(false);
  });

  test('ehAmbienteNaoProdutivo identifica dev e hml', () => {
    expect(ehAmbienteNaoProdutivo('dev')).toBe(true);
    expect(ehAmbienteNaoProdutivo('hml')).toBe(true);
    expect(ehAmbienteNaoProdutivo('prd')).toBe(false);
  });

  test('prepararParaAmbiente anonimiza e aprova pelo guard', () => {
    const pronto = prepararParaAmbiente(docProducao(), 'dev', { sal: SAL });
    expect(estaAnonimizado(pronto)).toBe(true);
    expect(usoPermitido(pronto, 'dev')).toBe(true);
    expect(JSON.stringify(pronto)).not.toContain('oid-entra-id-12345');
  });
});
