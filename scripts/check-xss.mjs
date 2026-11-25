import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { CONTENT_SECURITY_POLICY } from '../lib/securityHeaders.js';
const dom = new JSDOM('<div id="target"></div>', { runScripts: 'outside-only', url: 'https://super-app-go.duckdns.org' });
const { window } = dom;
window.eval(fs.readFileSync(new URL('../components/vendor/dompurify.min.js', import.meta.url), 'utf8'));
window.eval(fs.readFileSync(new URL('../components/security-dom.js', import.meta.url), 'utf8'));
const target = window.document.getElementById('target');
const payloads = ['<img src=x onerror="alert(1)">', '<svg onload="alert(1)"><script>alert(1)</script></svg>',
  '<a href="javascript:alert(1)">click</a>', '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<form id="__proto__"><input name="innerHTML"></form>'];
for (const payload of payloads) {
  for (const write of [html => target.innerHTML = html, html => target.insertAdjacentHTML('beforeend', html)]) {
    target.textContent = ''; write(payload);
    assert.equal(target.querySelectorAll('script,iframe,object,embed').length, 0);
    for (const element of target.querySelectorAll('*')) for (const attr of element.attributes) {
      assert.ok(!/^on/i.test(attr.name)); assert.ok(!/^javascript:/i.test(attr.value));
    }
  }
}
target.innerHTML = '<button id="save" data-ui-command="saveProjectName">Salvar</button><svg><path d="M0 0 L1 1"/></svg>';
assert.ok(target.querySelector('#save')); assert.ok(target.querySelector('path'));
target.firstChild.outerHTML = payloads[0];
assert.equal(target.querySelectorAll('[onerror]').length, 0);
assert.throws(() => window.document.write('unsafe'), /bloqueado/);
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) if(match[1].trim()) new vm.Script(match[1]);
assert.ok(!/\bon(?:click|change|input|submit|error)\s*=\s*["']/.test(html));
const scriptDirective = CONTENT_SECURITY_POLICY.split(';').find(d => d.trim().startsWith('script-src '));
assert.ok(!scriptDirective.includes('unsafe-inline')); assert.ok(!scriptDirective.includes('unsafe-eval'));
assert.ok(CONTENT_SECURITY_POLICY.includes("script-src-attr 'none'"));
console.log('PASS XSS: HTML sinks sanitised; malicious events/URLs removed; UI IDs/SVG preserved; CSP script hashes and no inline handlers.');
window.close();
