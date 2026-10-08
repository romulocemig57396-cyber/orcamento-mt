import '@testing-library/jest-dom'

/* Os testes de lógica e de tela usam uma biblioteca de custos FIXA — a da main
   no commit 5826a17 (src/test/fixtures/biblioteca-base.json) —, e não o
   src/data/biblioteca.json instalado, que cresce a cada atualização do
   responsável (referências e itens novos). Assim nenhum teste depende de a
   biblioteca ficar congelada. Os testes do arquivo instalado
   (bibliotecaInstalada.test.js) o leem do disco e conferem só regras que
   valem para sempre.                                                         */
import { vi } from 'vitest';
vi.mock('../data/biblioteca.json', async () => ({
  default: (await import('./fixtures/biblioteca-base.json')).default,
}));
