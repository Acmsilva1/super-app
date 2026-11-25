const STORAGE_KEY = 'superapp_biometric';
const VERIFIED_SESSION_KEY = 'superapp_biometric_verified_user';
const OPAQUE_SESSION_KEY = 'superapp_biometric_verified_session';

function removeLegacyBiometricData() {
  try { localStorage.removeItem(VERIFIED_SESSION_KEY); } catch {}
  if (typeof document !== 'undefined') {
    for (const name of ['superapp_biometric', VERIFIED_SESSION_KEY]) {
      document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Strict`;
    }
  }
}

function bufferToBase64Url(value) {
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value || []);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBuffer(value) {
  const padded = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function readBiometricPreference() {
  try {
    removeLegacyBiometricData();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    removeLegacyBiometricData();
    if (!parsed || typeof parsed.credentialId !== 'string' || !/^[A-Za-z0-9_-]{8,2048}$/.test(parsed.credentialId)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    const clean = { credentialId: parsed.credentialId };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    return clean;
  } catch {
    return null;
  }
}

export function writeBiometricPreference(value) {
  if (!value) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  removeLegacyBiometricData();
  if (typeof value.credentialId !== 'string' || !/^[A-Za-z0-9_-]{8,2048}$/.test(value.credentialId)) throw Error('Credencial biométrica inválida.');
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ credentialId: value.credentialId }));
}

export function clearBiometricPreference() {
  localStorage.removeItem(STORAGE_KEY);
}

async function opaqueSessionDigest(accessToken) {
  const encoded = String(accessToken || '').split('.')[1];
  const claims = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')));
  if (typeof claims.session_id !== 'string' || !claims.session_id) throw Error('Identificador de sessão indisponível.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(claims.session_id));
  return bufferToBase64Url(digest);
}

export async function markBiometricSessionVerified(accessToken) {
  removeLegacyBiometricData();
  sessionStorage.setItem(OPAQUE_SESSION_KEY, await opaqueSessionDigest(accessToken));
}

export async function isBiometricSessionVerified(accessToken) {
  try {
    removeLegacyBiometricData();
    return sessionStorage.getItem(OPAQUE_SESSION_KEY) === await opaqueSessionDigest(accessToken);
  } catch {
    return false;
  }
}

export function clearBiometricSessionVerified() {
  try {
    localStorage.removeItem(VERIFIED_SESSION_KEY);
    sessionStorage.removeItem(OPAQUE_SESSION_KEY);
  } catch {
    // A ausência do marcador fará o próximo acesso móvel voltar ao login.
  }
}

export function isBiometricPreferred() {
  const pref = readBiometricPreference();
  return Boolean(pref?.credentialId);
}

/** Biometria só no mobile (telefone/tablet). Desktop usa e-mail e senha. */
export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  if (navigator.userAgentData?.mobile === true) return true;
  const ua = String(navigator.userAgent || '');
  if (/Android|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
  // iPadOS moderno se identifica como Mac, mas tem toque.
  if (/iPad/i.test(ua) || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1)) {
    return true;
  }
  return false;
}

export async function supportsPlatformAuth() {
  if (!isMobileDevice()) return false;
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
  if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
    return false;
  }
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function publicKeyCredentialToJSON(cred) {
  if (!cred) return null;
  const response = cred.response;
  const json = {
    id: cred.id,
    rawId: bufferToBase64Url(cred.rawId),
    type: cred.type,
    response: {},
    clientExtensionResults: cred.getClientExtensionResults?.() || {},
  };
  if (response.clientDataJSON) json.response.clientDataJSON = bufferToBase64Url(response.clientDataJSON);
  if (response.attestationObject) json.response.attestationObject = bufferToBase64Url(response.attestationObject);
  if (response.authenticatorData) json.response.authenticatorData = bufferToBase64Url(response.authenticatorData);
  if (response.signature) json.response.signature = bufferToBase64Url(response.signature);
  if (response.userHandle) json.response.userHandle = bufferToBase64Url(response.userHandle);
  if (response.getTransports) json.response.transports = response.getTransports();
  return json;
}

function reviveCreationOptions(options) {
  const next = structuredClone(options);
  next.challenge = base64UrlToBuffer(options.challenge);
  if (next.user?.id && typeof next.user.id === 'string') {
    next.user.id = base64UrlToBuffer(next.user.id);
  }
  if (Array.isArray(next.excludeCredentials)) {
    next.excludeCredentials = next.excludeCredentials.map((item) => ({
      ...item,
      id: typeof item.id === 'string' ? base64UrlToBuffer(item.id) : item.id,
    }));
  }
  return next;
}

function reviveRequestOptions(options) {
  const next = structuredClone(options);
  next.challenge = base64UrlToBuffer(options.challenge);
  if (Array.isArray(next.allowCredentials)) {
    next.allowCredentials = next.allowCredentials.map((item) => ({
      ...item,
      id: typeof item.id === 'string' ? base64UrlToBuffer(item.id) : item.id,
    }));
  }
  return next;
}

async function api(path, { method = 'POST', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : '{}',
    credentials: 'same-origin',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || 'Ação indisponível.');
  return data;
}

export async function enrollBiometric(accessToken) {
  if (!await supportsPlatformAuth()) {
    throw Error('A biometria obrigatória só está disponível em celulares e tablets compatíveis.');
  }
  const { options } = await api('/api/webauthn?action=register-options', { token: accessToken });
  const credential = await navigator.credentials.create({
    publicKey: reviveCreationOptions(options),
  });
  if (!credential) throw Error('Não foi possível capturar a biometria.');
  return api('/api/webauthn?action=register', {
    token: accessToken,
    body: { response: publicKeyCredentialToJSON(credential) },
  });
}

export async function verifyBiometricFactor(accessToken, credentialId) {
  if (!await supportsPlatformAuth()) {
    throw Error('A biometria obrigatória só está disponível em celulares e tablets compatíveis.');
  }
  const { options } = await api('/api/webauthn?action=factor-options', {
    token: accessToken,
    body: { credentialId },
  });
  const assertion = await navigator.credentials.get({
    publicKey: reviveRequestOptions(options),
  });
  if (!assertion) throw Error('Biometria cancelada.');
  return api('/api/webauthn?action=factor-verify', {
    token: accessToken,
    body: { response: publicKeyCredentialToJSON(assertion) },
  });
}

export async function revokeBiometric(accessToken, credentialId) {
  if (!credentialId) {
    clearBiometricPreference();
    return { ok: true };
  }
  try {
    await api('/api/webauthn?action=revoke', {
      token: accessToken,
      body: { credentialId },
    });
  } catch {
    // Preferência local ainda deve ser limpa.
  }
  clearBiometricPreference();
  return { ok: true };
}
