const fs = require('node:fs');
const path = require('node:path');

function functionEntries(root) {
  const api = path.join(root, 'api');
  return fs.readdirSync(api, { recursive: true }).filter(file => {
    const parts = file.replace(/\\/g, '/').split('/');
    return !parts.some(part => /^[_.]/.test(part))
      && !file.endsWith('.d.ts')
      && /\.(?:[cm]?js|tsx?|py|go|rb)$/.test(file)
      && fs.statSync(path.join(api, file)).isFile();
  });
}

module.exports = { functionEntries };
if (require.main === module) {
  const entries = functionEntries(process.cwd());
  console.log(`Vercel: ${entries.length}/12 entradas de Functions.`);
  if (entries.length > 12) {
    console.error('Limite Hobby excedido. Consolide rotas antes de publicar.\n' + entries.join('\n'));
    process.exitCode = 1;
  }
}
