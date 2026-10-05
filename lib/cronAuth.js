import crypto from 'node:crypto';

export function isCronAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  const supplied = String(req.headers?.authorization || '');
  if (!secret || secret.length < 32) return false;
  const expected = `Bearer ${secret}`;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
