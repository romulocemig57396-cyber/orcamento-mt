/* ─────────────────────────────────────────────────────────────────────────────
   modoAdmin.js — mostra as telas de manutenção da biblioteca

   Ligado por `?admin=1` na URL. **Isto não é segurança**: o app é estático e
   público, e qualquer pessoa pode abrir a URL com o parâmetro. Serve só para
   não deixar as telas de manutenção no caminho dos analistas, que usam o app
   para fazer orçamento.
   ───────────────────────────────────────────────────────────────────────────── */

export const ehModoAdmin = (busca) => {
  const texto = busca ?? (typeof window !== 'undefined' ? window.location.search : '');
  try {
    return new URLSearchParams(texto).get('admin') === '1';
  } catch {
    return false;
  }
};
