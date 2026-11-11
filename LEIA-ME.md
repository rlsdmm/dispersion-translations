# Dispersion Translations — guia rápido

Site estático (GitHub Pages) + Supabase (login, banco de dados e imagens).

- `index.html` — página inicial
- `serie.html` — página da obra
- `ler.html` — leitor
- `admin.html` — **Área do grupo** (login, envio de capítulos, cadastro de obras)

---

## Configurar o Supabase (uma vez só, ~10 minutos)

1. **Criar o projeto** — entre em https://supabase.com, crie uma conta (grátis) e um *New project*.
   Região sugerida: *South America (São Paulo)*. Guarde a senha do banco num lugar seguro.

2. **Criar as tabelas** — no projeto, vá em **SQL Editor → New query**, cole todo o conteúdo de
   `supabase/schema.sql` e clique em **Run**.

3. **Bloquear cadastro público** — em **Authentication → Sign In / Providers**, desligue
   **"Allow new users to sign up"**. Assim só entra quem você criar.
   (Mesmo se alguém conseguisse criar conta, não conseguiria enviar nada sem ser membro.)

4. **Endereço do site** — em **Authentication → URL Configuration**:
   - *Site URL*: `https://rlsdmm.github.io/dispersion-translations/admin.html`
   - *Redirect URLs*: adicione o mesmo endereço (e `http://localhost:5173/admin.html` se for testar no PC).
   Isso faz os links de "esqueci a senha" e de convite voltarem pro painel.

5. **Criar as contas do grupo** — em **Authentication → Users → Add user**:
   - *Create new user*: você define e-mail e senha e passa pra pessoa; ou
   - *Send invitation*: a pessoa recebe um e-mail e cria a própria senha.

6. **Tornar a conta membro** — no **SQL Editor**, rode (trocando nome, e-mail e cargo):
   ```sql
   insert into public.membros (user_id, nome, cargo)
   select id, 'Nome da Pessoa', 'tradutor' from auth.users where email = 'email@exemplo.com';
   ```
   Pra tirar alguém do grupo: `delete from public.membros where user_id = (select id from auth.users where email = 'email@exemplo.com');`

7. **Ligar o site ao Supabase** — em **Project Settings → API** copie:
   - *Project URL* → `supabaseUrl` em `js/config.js`
   - *anon public key* → `supabaseAnonKey` em `js/config.js`

   ⚠️ Nunca use a chave **service_role** no site.

8. **Publicar** — na pasta do projeto:
   ```
   git add -A
   git commit -m "Liga o site ao Supabase"
   git push
   ```

Pronto: o site passa a mostrar as obras do Supabase (começa vazio) e a Área do grupo fica ativa.

---

## Usar a Área do grupo

`https://rlsdmm.github.io/dispersion-translations/admin.html` (tem um link discreto no rodapé do site)

- **Obras** — cadastre a obra primeiro (título, capa, sinopse, gêneros, status). O "endereço (id)"
  é o que aparece no link da obra e não muda depois.
- **Enviar capítulo** — escolha a obra, número, data, arraste as páginas. Elas ficam em ordem
  pelo nome do arquivo (01, 02, 03…) e dá pra arrastar as miniaturas pra reordenar.
  Com "Converter pra WebP" ligado, as imagens ficam bem menores sem perder qualidade visível.
  Enviar um número que já existe substitui as páginas daquele capítulo.
- **Capítulos** — ler, editar título/data, trocar páginas ou excluir.

## Limites do plano grátis do Supabase

- 1 GB de imagens (com WebP, um capítulo costuma ficar entre 2 e 6 MB → algo como 200–400 capítulos).
- 5 GB de tráfego por mês.
- Projeto pausa depois de 1 semana **sem nenhum acesso** — é só entrar no painel do Supabase e reativar.

Se crescer além disso: plano Pro do Supabase, ou mover as imagens pro Cloudflare R2 (10 GB grátis, tráfego ilimitado).

## Testar no PC

```
python -m http.server 5173
```
e abra http://localhost:5173
