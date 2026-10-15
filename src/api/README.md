# API serverless — esqueleto e contrato de rotas

Camada de back-end introduzida pela adequação às diretrizes Cemig (spec
`adequacao-diretrizes-cemig`, tarefa 5.1). É escrita de forma **framework-agnóstica**:
um roteador HTTP puro (`roteador.js`) despacha requisições para handlers, sem
depender do runtime de hospedagem (Azure App Service / Functions). Um adaptador
fino no runtime converte a requisição nativa para `RequisicaoApi` e a `RespostaApi`
de volta para o formato nativo.

Nesta etapa há **apenas o esqueleto**: `GET /api/health` responde `200`; as demais
rotas respondem `501 Not Implemented`. A lógica de negócio entra nas tarefas
seguintes.

## Contrato de rotas

Fonte única de verdade: [`contrato.js`](./contrato.js).

| Método | Rota | Papel mínimo | Permissão RBAC | Descrição | Requisitos |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/health` | — (pública) | — | Health check (sem dados) | R10 |
| GET | `/api/orcamentos` | leitor | `orcamentos:ler` | Lista orçamentos do usuário/escopo | R2 |
| GET | `/api/orcamentos/{id}` | leitor | `orcamentos:ler` | Recupera um orçamento | R5 |
| PUT | `/api/orcamentos/{id}` | editor | `orcamentos:gravar` | Cria/atualiza orçamento (gravação atômica) | R5.4 |
| DELETE | `/api/orcamentos/{id}` | editor/admin | `orcamentos:remover` | Remove orçamento | R2 |
| POST | `/api/titular/solicitacoes` | editor | `titular:registrar` | Registra solicitação de direito do titular (LGPD) | R11.4 |

> `GET /api/health` é a única rota pública (não exige token). Todas as demais
> exigem token válido e papel autorizado quando as camadas correspondentes forem
> plugadas.

## Estrutura

```
src/api/
  index.js          Ponto de entrada (reexporta contrato, roteador, http)
  contrato.js       Tabela de rotas: método, caminho, papel, permissão, requisitos
  roteador.js       Roteador puro: casa rota, resolve params, aplica ganchos, despacha
  http.js           Primitivas RequisicaoApi/RespostaApi e helpers (json, erro, 501)
  handlers/
    index.js        Registro de handlers por chave
    health.js       GET /api/health (200)
    orcamentos.js   GET/PUT/DELETE de orçamentos (stub 501)
    titular.js      POST solicitações do titular (stub 501)
```

## Pontos de extensão

O roteador (`criarRoteador(deps)`) expõe ganchos opcionais, preenchidos pelo
adaptador de runtime conforme as próximas tarefas:

| Gancho / dep | Camada | Tarefa | Requisitos |
| --- | --- | --- | --- |
| `deps.validarToken` | Validação de token (JWKS) | 5.2 | R1.2, R1.3, R1.7 |
| `deps.resolverSessao` | Sessão + expiração por inatividade | 5.4 | R1.4 |
| `deps.autorizar` | RBAC + negação por padrão | 5.6 / 5.8 | R1.6, R2 |
| `deps.persistencia` | Cliente Cosmos DB | 8.2 | R5 |
| `deps.segredos` | Key Vault + Managed Identity | 9.1 | R9 |
| `deps.logger` | Logging estruturado + métricas | 4.x | R10 |

Enquanto um gancho não é injetado, o passo correspondente é ignorado — o esqueleto
permanece funcional e os contratos de borda estáveis.

## Uso (adaptador de runtime)

```js
import { criarRoteador } from './api/index.js';

const despachar = criarRoteador({
  // validarToken, resolverSessao, autorizar, persistencia, segredos, logger
  // são injetados conforme as tarefas 5.2+, 8.2, 9.1, 4.x.
});

const resposta = await despachar({
  metodo: 'GET',
  caminho: '/api/health',
  params: {}, query: {}, headers: {}, corpo: null, sessao: null,
});
// → { status: 200, headers: {...}, corpo: { status: 'ok' } }
```

