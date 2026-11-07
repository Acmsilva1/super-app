// Copia explícita da versão aprovada; nunca publica ou acessa a VPS.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('../components/ui/', import.meta.url));
const files = ['atoms/dom.mjs', 'molecules/message.mjs', 'organisms/feedback.mjs'];
const args = process.argv.slice(2);
const check = args.includes('--check');
const targets = args.filter(arg => arg !== '--check');
if (!targets.length) throw new Error('Informe os diretórios dos repositórios de destino. Use --check para apenas verificar.');
for (const target of targets) {
  const root = resolve(target);
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  if (!['central-comando-vps', 'wastapp-mensageria'].includes(pkg.name)) throw new Error('Destino não é um painel compatível.');
  for (const file of files) {
    const content = await readFile(resolve(source, file));
    const output = resolve(root, 'public/ui', file);
    if (check) {
      if (!content.equals(await readFile(output))) throw new Error(`Componente divergente: ${output}`);
    } else {
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, content);
    }
  }
  console.log(`${pkg.name}: Atomic UI 1.0.0 ${check ? 'conferida' : 'sincronizada'}`);
}
