import fs from 'node:fs';
import crypto from 'node:crypto';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
const scriptHashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .filter(match => match[1].trim())
  .map(match => `'sha256-${crypto.createHash('sha256').update(match[1]).digest('base64')}'`);
export const CONTENT_SECURITY_POLICY = `default-src 'self'; script-src 'self' ${scriptHashes.join(' ')} https://cdn.jsdelivr.net/npm/motion@11.11.13/dist/motion.min.js; script-src-attr 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; worker-src 'self'; trusted-types default dompurify; require-trusted-types-for 'script'`;
export function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
}
