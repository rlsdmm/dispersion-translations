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
  supabaseUrl: "https://mslgqtpvieewxqebajzv.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zbGdxdHB2aWVld3hxZWJhanp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0MTg1MjUsImV4cCI6MjEwOTk5NDUyNX0.ME2TJsuHyFRM8OKzKIprfCmgwCJ8aLdQ06v5ke_HPIs",

  // Botões de login social na página "Minha conta". Ative o provedor no
  // Supabase (Authentication → Sign In / Providers) antes de colocar aqui.
  // Ex: provedores: ["discord", "google"],
  provedores: ["discord"],

  // Onde ficam as imagens. Vazio = Supabase Storage (1 GB grátis).
  // Com Cloudflare R2: envio = endereço do Worker (pasta worker/), publico = domínio público do bucket.
  // Ex: imagens: { envio: "https://dispersion-imagens.SEU.workers.dev", publico: "https://pub-XXXX.r2.dev" },
  imagens: {
    envio: "https://dispersion-imagens.meu-streamable.workers.dev",
    publico: "https://pub-bc9c4e78097e4918a8310d50836a68c8.r2.dev",
  },
};
