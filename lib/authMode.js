const DEFAULT_FIXED_USER_ID = 'f88a6351-317d-425b-afcd-9430c8a34f53';
const DEFAULT_FIXED_USER_EMAIL = 'andrecarlos.miranda@gmail.com';

export function isFixedAuthMode() {
  return process.env.AUTH_MODE === 'fixed';
}

export function getFixedUser() {
  return {
    id: process.env.FIXED_USER_ID || DEFAULT_FIXED_USER_ID,
    email: process.env.FIXED_USER_EMAIL || DEFAULT_FIXED_USER_EMAIL,
  };
}
