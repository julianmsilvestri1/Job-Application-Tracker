// Origin lock for /api/extension/* — used by browser extensions (Chrome, Safari).
// When EXTENSION_ALLOWED_ORIGINS is set (comma-separated), only those origins pass.
// When unset, localhost and standard extension schemes are allowed for local dev.

function parseAllowedOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isLocalDevOrigin(origin) {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function isExtensionSchemeOrigin(origin) {
  return /^(chrome-extension|moz-extension|safari-web-extension):\/\//.test(origin);
}

function originPermitted(origin, allowed) {
  if (allowed.length > 0) return allowed.includes(origin);
  return isLocalDevOrigin(origin) || isExtensionSchemeOrigin(origin);
}

function setCorsHeaders(res, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export function extensionCors(req, res, next) {
  const origin = req.headers.origin;

  if (req.method === 'OPTIONS') {
    if (!origin) return res.sendStatus(204);
    if (!originPermitted(origin, parseAllowedOrigins(process.env.EXTENSION_ALLOWED_ORIGINS))) {
      return res.status(403).json({ error: 'Origin not allowed' });
    }
    setCorsHeaders(res, origin);
    return res.sendStatus(204);
  }

  if (origin) {
    if (!originPermitted(origin, parseAllowedOrigins(process.env.EXTENSION_ALLOWED_ORIGINS))) {
      return res.status(403).json({ error: 'Origin not allowed' });
    }
    setCorsHeaders(res, origin);
  }

  next();
}
