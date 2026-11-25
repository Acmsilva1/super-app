# Rate limit compartilhado

`consumeActionLimit` limita operações por chave SHA-256 (não envia e-mail/IP em claro ao armazenamento). `requireUser` aplica 240 requisições/minuto por usuário autenticado; WebAuthn aplica também 20/minuto. Excesso recebe 429 e indisponibilidade do provedor recebe 503, sem liberar acesso nem usar contador em memória.

Na VPS, `docker-compose.yml` configura `RATE_LIMIT_BACKEND=redis` e `REDIS_URL=redis://rate-limit:6379`. O serviço Redis não publica portas e usa uma rede interna exclusiva com o Super App, limite de memória, política `noeviction` e volume `rate-limit-data` com AOF (sincronização a cada segundo). Reiniciar o app mantém os contadores; o AOF pode perder o último segundo em falha abrupta do host. Não remover o volume durante deploy/rollback.

Fora desse Compose, o padrão `RATE_LIMIT_BACKEND=postgres` preserva o RPC persistente `consume_action_limit` já usado no projeto. Todos os processos precisam apontar para o mesmo banco. Confirmar o RPC antes de publicar: a proteção agora é chamada em toda requisição autenticada.

Para Upstash Redis REST, configurar no ambiente servidor (fora do Git):

```
RATE_LIMIT_BACKEND=redis
UPSTASH_REDIS_REST_URL=https://SEU-ENDPOINT.upstash.io
UPSTASH_REDIS_REST_TOKEN=SEGREDO_NO_AMBIENTE
```

A operação `EVAL` incrementa e define expiração atomicamente no mesmo Redis, compartilhado pelas réplicas. Selecionar Redis sem URL HTTPS/token impede as operações protegidas; falha de rede também fecha o acesso. Não há fallback silencioso. A ativação depende de credenciais reais e conectividade do serviço; adicionar as variáveis somente depois de provisionar o Redis.

Executar `node scripts/check-security.mjs` para os testes de autorização e do contrato Redis. O workflow `security.yml` executa os mesmos testes em push/PR. São testes locais com respostas simuladas; não comprovam Redis real, RLS de produção ou pentest independente.
