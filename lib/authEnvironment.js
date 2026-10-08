export function unsafeAuthEnvironment() {
  const deployed = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';
  return (deployed && (process.env.OFFLINE_DEV === 'true' || process.env.NODE_ENV === 'test'))
    || (Boolean(process.env.VERCEL) && process.env.AUTH_MODE === 'fixed');
}
