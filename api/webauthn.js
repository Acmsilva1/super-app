function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(body));
}

/** Login biométrico desativado — apenas e-mail/senha. */
export default async function handler(req, res) {
  return json(res, 410, { error: 'Login por biometria foi desativado. Use e-mail e senha.' });
}
