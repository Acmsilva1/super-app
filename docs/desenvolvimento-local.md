# Desenvolvimento local e testes

`npm run dev` e `npm run dev:mock` iniciam Vite e backend em localhost com dados ficticios. Nao e necessario configurar Supabase. O login aceita um email e uma senha ficticios nesse modo. Financeiro, Saude, Lista de Compras, Fluxograma e administracao usam mocks. Os dados em memoria reiniciam ao encerrar o backend; alguns controles da interface usam localStorage do navegador.

As portas padrao sao 5173 (interface) e 3002 (API). Podem ser ajustadas em `.env.local` com `VITE_PORT` e `PORT`. O servidor aceita apenas conexoes locais. Credenciais e arquivos locais sao ignorados pelo Git e excluidos do pacote Vercel.

`npm run dev:real` e uma escolha explicita para acessar o Supabase configurado em `.env.local`. Use apenas um ambiente de teste. O agendador automatico fica desativado no desenvolvimento. O login de producao continua usando Supabase Auth.

## Telegram manual

Configure somente no arquivo ignorado `.env.telegram.local`:

```dotenv
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Com Python instalado, execute `npm run test:telegram`. O Node inicia o gateway Python em uma porta aleatoria de localhost e envia duas mensagens identificadas como TESTE MANUAL: agua e dieta. Os dados sao sinteticos. Isso testa o transporte Node -> Python -> Telegram; nao comprova o funcionamento do cron da Vercel, GitHub Actions ou banco real. Para outro executavel Python, configure `PYTHON_EXECUTABLE`.

## Validacoes

- `npm test`: analise UX e suite JavaScript.
- `python -m unittest discover -s tests/python`: testes isolados do gateway Python.
- `npm run build`: script de build existente, que sincroniza a versao. Nao gera um bundle nem realiza deploy.

Migrations em `migration/` continuam versionadas. Relatorios, caches, arquivos de ambiente e dados pessoais locais nao devem ser commitados.
