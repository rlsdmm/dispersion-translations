/*
 * Conexão com o Supabase.
 * Pegue os dois valores em: Supabase → Project Settings → API
 *   - Project URL         → supabaseUrl
 *   - anon / public key   → supabaseAnonKey
 *
 * A chave "anon" é pública de propósito (vai no site mesmo); quem protege
 * os dados são as regras do arquivo supabase/schema.sql.
 * NUNCA coloque aqui a chave "service_role".
 *
 * Enquanto estiver vazio, o site mostra as obras de exemplo do js/data.js.
 */
window.DT_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
};
