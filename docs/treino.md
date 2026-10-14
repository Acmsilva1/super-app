# Treino por perfil de Saúde

Entrada: Saúde → perfil existente → Treino. Não depende de cadastrar outro perfil.

## Ativação no Supabase

Execute no SQL Editor, nesta ordem:

1. `migration/20261013_create_saude_treinos.sql`: três tabelas novas.
2. `migration/20261013_saude_treinos_api.sql`: gravação atômica, leitura e exclusão.

Se a primeira já foi aplicada, execute somente a segunda. Ambas são reaplicáveis.
Depois publique o código atualizado. Sem as migrations, o módulo mostra uma mensagem
de configuração pendente; em produção não salva silenciosamente no navegador.

## Persistência

- Produção e desenvolvimento com dados reais: `/api/saude?resource=treinos&profile_id=...`.
- Desenvolvimento offline: armazenamento local por perfil, mantendo o esboço existente.
- O backend resolve o proprietário do perfil antes de chamar a RPC. Alterações pelo
  admin permanecem vinculadas ao proprietário, sem trocar a autoria.
- Edição e exclusão usam `updated_at` para evitar sobrescrever outra sessão.
- As funções SQL não representam novas Functions da Vercel. A rota usa `api/saude.js`.

## Reversão

`migration/rollback/20261013_saude_treinos_api.sql` remove as funções novas e conserva
as tabelas e os dados. O rollback da estrutura só permite remover tabelas vazias.

## Validação

Contratos da API, CRUD em PostgreSQL efêmero, falhas atômicas, isolamento entre perfis,
conflitos de edição, retry de criação e persistência local foram testados localmente.
A execução das migrations e a integração no Supabase de produção ainda precisam ser
confirmadas no ambiente publicado.
