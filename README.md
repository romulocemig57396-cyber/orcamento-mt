# ⚡ Sistema de Orçamento MT

Sistema web para criação e gestão de orçamentos de obras em Média Tensão, desenvolvido com React.js.

## 🚀 Funcionalidades

- ✅ Cadastro completo de dados de atendimento
- ✅ Lançamento de itens de obra
- ✅ Cálculo automático de CT, PP, ERD e PFC
- ✅ Geração automática de memorial descritivo
- ✅ Resumo financeiro detalhado
- ✅ Exportação para Excel e PDF
- ✅ Salvamento automático no navegador

## 🛠️ Tecnologias

- React 18
- Vite
- Tailwind CSS
- SheetJS (xlsx)
- jsPDF

## 📦 Instalação

```bash
# Clone o repositório ou extraia os arquivos

# Entre na pasta do projeto
cd orcamento-mt-app

# Instale as dependências
npm install

# Inicie o servidor de desenvolvimento
npm run dev

# Rode os testes
npm run test:run
```

## 🌐 Publicação (GitHub Pages)

O app fica em https://romulocemig57396-cyber.github.io/orcamento-mt/

A publicação é automática: a cada push na `main`, o GitHub Actions
(`.github/workflows/deploy.yml`) roda os testes e o build e envia a pasta
`dist` para a branch `gh-pages`. Se os testes falharem, nada é publicado.

Para publicar manualmente: aba **Actions** → "Publicar no GitHub Pages" →
**Run workflow**, ou `npm run deploy` no computador.

