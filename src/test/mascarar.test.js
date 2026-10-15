import { describe, test, expect } from 'vitest';
import {
  MARCADOR,
  CHAVES_SENSIVEIS_PADRAO,
  chaveEhSensivel,
  mascararString,
  mascararValor,
  mascararObjeto,
  mascarar,
} from '../observabilidade/mascarar';

describe('mascarar — chaveEhSensivel', () => {
  test('reconhece chaves sensíveis independente de caixa, espaços e separadores', () => {
    expect(chaveEhSensivel('cpf')).toBe(true);
    expect(chaveEhSensivel('CPF')).toBe(true);
    expect(chaveEhSensivel('connectionString')).toBe(true);
    expect(chaveEhSensivel('connection_string')).toBe(true);
    expect(chaveEhSensivel('API-KEY')).toBe(true);
    expect(chaveEhSensivel('e-mail')).toBe(true);
  });

  test('não marca chaves comuns como sensíveis', () => {
    expect(chaveEhSensivel('municipio')).toBe(false);
    expect(chaveEhSensivel('valor')).toBe(false);
    expect(chaveEhSensivel('id')).toBe(false);
  });
});

describe('mascarar — mascararString (padrões embutidos)', () => {
  test('mascara e-mail embutido em mensagem de erro', () => {
    const r = mascararString('Falha ao notificar joao.silva@cemig.com.br agora');
    expect(r).not.toContain('joao.silva@cemig.com.br');
    expect(r).toContain(MARCADOR);
  });

  test('mascara CPF formatado e sem formatação', () => {
    expect(mascararString('CPF 123.456.789-09 recusado')).not.toContain('123.456.789-09');
    expect(mascararString('doc 12345678909 invalido')).not.toContain('12345678909');
  });

  test('mascara JWT e token Bearer', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc_DEF-123';
    expect(mascararString(`token=${jwt}`)).not.toContain(jwt);
    expect(mascararString('Authorization: Bearer abc.def.ghi123==')).not.toContain('abc.def.ghi123');
  });

  test('mascara trechos de connection string', () => {
    const cs = 'AccountEndpoint=https://x.documents.azure.com;AccountKey=SECRETO123==;';
    const r = mascararString(cs);
    expect(r).not.toContain('SECRETO123==');
  });

  test('deixa texto sem dados sensíveis inalterado', () => {
    const texto = 'Orçamento 42 criado com sucesso';
    expect(mascararString(texto)).toBe(texto);
  });
});

describe('mascarar — mascararValor', () => {
  test('força marcador fixo quando sensivel=true, inclusive para objetos', () => {
    expect(mascararValor('qualquer-segredo', { sensivel: true })).toBe(MARCADOR);
    expect(mascararValor({ a: 1 }, { sensivel: true })).toBe(MARCADOR);
  });

  test('não é reversível: valores diferentes produzem o mesmo marcador', () => {
    const a = mascararValor('segredoA', { sensivel: true });
    const b = mascararValor('segredoB-muito-mais-longo', { sensivel: true });
    expect(a).toBe(b);
    expect(a).toBe(MARCADOR);
  });

  test('preserva primitivos não sensíveis', () => {
    expect(mascararValor(42)).toBe(42);
    expect(mascararValor(true)).toBe(true);
    expect(mascararValor(null)).toBe(null);
  });
});

describe('mascarar — mascararObjeto', () => {
  test('mascara valores sob chaves sensíveis e preserva os demais', () => {
    const entrada = {
      cliente: 'Obra X',
      cpf: '123.456.789-09',
      token: 'abc123',
      municipio: 'Belo Horizonte',
    };
    const r = mascararObjeto(entrada);
    expect(r.cpf).toBe(MARCADOR);
    expect(r.token).toBe(MARCADOR);
    expect(r.cliente).toBe('Obra X');
    expect(r.municipio).toBe('Belo Horizonte');
  });

  test('não muta a entrada original', () => {
    const entrada = { senha: 'segredo', nome: 'Fulano' };
    const copia = JSON.parse(JSON.stringify(entrada));
    mascararObjeto(entrada);
    expect(entrada).toEqual(copia);
  });

  test('percorre objetos aninhados e arrays', () => {
    const entrada = {
      atendimento: {
        requerente: { nome: 'Maria', email: 'maria@cemig.com' },
        itens: [{ descricao: 'poste', senha: 'x' }],
      },
    };
    const r = mascararObjeto(entrada);
    // 'nome' e 'email' são chaves sensíveis mesmo aninhadas
    expect(r.atendimento.requerente.nome).toBe(MARCADOR);
    expect(r.atendimento.requerente.email).toBe(MARCADOR);
    expect(r.atendimento.itens[0].senha).toBe(MARCADOR);
    expect(r.atendimento.itens[0].descricao).toBe('poste');
  });

  test('chave sensível que aponta para objeto redige o objeto inteiro', () => {
    // 'titular' é chave sensível: todo o conteúdo abaixo dela é descartado
    const entrada = { titular: { nome: 'Maria', email: 'maria@cemig.com' } };
    const r = mascararObjeto(entrada);
    expect(r.titular).toBe(MARCADOR);
    expect(JSON.stringify(r)).not.toContain('maria@cemig.com');
    expect(JSON.stringify(r)).not.toContain('Maria');
  });

  test('garante que o valor original não é recuperável do conteúdo gravado', () => {
    const original = 'joao@cemig.com.br';
    const entrada = { email: original, obs: `contato ${original}` };
    const serializado = JSON.stringify(mascararObjeto(entrada));
    expect(serializado).not.toContain(original);
  });

  test('trata referências cíclicas sem estourar a pilha', () => {
    const entrada = { nome: 'x' };
    entrada.self = entrada;
    const r = mascararObjeto(entrada);
    expect(r.nome).toBe(MARCADOR);
    expect(r.self).toBe('[CYCLIC]');
  });

  test('mascara mensagem de Error embutida', () => {
    const erro = new Error('conexão falhou com AccountKey=TOPSECRET==;');
    const r = mascararObjeto({ erro });
    expect(r.erro.message).not.toContain('TOPSECRET');
  });

  test('respeita chaves sensíveis customizadas', () => {
    const r = mascararObjeto({ matricula: '12345', nome: 'Z' }, { chavesSensiveis: ['matricula'] });
    expect(r.matricula).toBe(MARCADOR);
    // 'nome' não está na lista custom -> preservado
    expect(r.nome).toBe('Z');
  });
});

describe('mascarar — ponto de entrada', () => {
  test('mascarar() delega para mascararValor', () => {
    expect(mascarar('Bearer abc.def.ghi')).toContain(MARCADOR);
    expect(mascarar({ cpf: '1' }).cpf).toBe(MARCADOR);
  });

  test('lista padrão de chaves inclui dado pessoal e segredos', () => {
    expect(CHAVES_SENSIVEIS_PADRAO).toContain('cpf');
    expect(CHAVES_SENSIVEIS_PADRAO).toContain('connectionstring');
  });
});
