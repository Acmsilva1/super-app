# Proteção do frontend

A CSP de scripts permite somente arquivos da própria origem, o Motion em caminho/versionamento fixo e hashes dos scripts inline revisados. Eventos HTML inline e eval são bloqueados. `scripts/sync-security-headers.mjs` atualiza o contrato Vercel; na VPS os hashes são calculados do arquivo servido, normalizando quebras de linha.

DOMPurify 3.5.0 é servido localmente e carrega antes do aplicativo. `components/security-dom.js` sanitiza os pontos de inserção HTML (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, fragments e ShadowRoot), bloqueia document.write e instala Trusted Types quando disponível. Não adicionar caminhos de inserção HTML que contornem essa camada. Novos componentes devem preferir textContent/createElement; não adicionar eventos como atributos HTML.

Os estilos inline permanecem permitidos para as posições e dimensões dinâmicas das janelas e dos gráficos. Isso é uma exceção explícita da política, não uma CSP totalmente sem inline. A proteção não substitui validação e autorização no servidor e não garante ausência de XSS.

`npm run test:security` verifica isolamento entre usuários, falha fechada do limitador, privacidade e payloads XSS. A suíte completa deve passar antes de publicar mudanças. Os testes DOM usam jsdom; confirmação visual no navegador e cerimônia WebAuthn real precisam ser verificadas separadamente.
