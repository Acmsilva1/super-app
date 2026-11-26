export function unsafeAuthEnvironment() {
  return process.env.NODE_ENV === 'production' && process.env.OFFLINE_DEV === 'true';
}
