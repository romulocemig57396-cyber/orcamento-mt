/* ─────────────────────────────────────────────────────────────────────────────
   msalInstance.js — fábrica da instância real do MSAL (@azure/msal-browser)

   Único ponto do código que importa o @azure/msal-browser de verdade. Mantê-lo
   isolado permite que todo o restante (wrapper, contexto, guards) seja testado
   com o MSAL mockado, sem acoplar a biblioteca à lógica.

   `criarPublicClientApplication` tem a assinatura esperada por
   `criarAuthWrapper({ criarPca })`.
   ───────────────────────────────────────────────────────────────────────────── */

import { PublicClientApplication } from '@azure/msal-browser';

/**
 * Cria o `PublicClientApplication` do MSAL a partir da configuração.
 * (Authorization Code + PKCE é o fluxo padrão do msal-browser — R1.1.)
 *
 * @param {import('@azure/msal-browser').Configuration} config
 * @returns {import('@azure/msal-browser').PublicClientApplication}
 */
export function criarPublicClientApplication(config) {
  return new PublicClientApplication(config);
}

export default criarPublicClientApplication;
