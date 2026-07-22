/**
 * pay-table 서버 공통 (auth / storage 공유)
 * service_role 우선, 없으면 서버 전용 anon (브라우저 비노출)
 */
const crypto = require('crypto');

const SB_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SB_SERVICE_KEY ||
  '';
const SESSION_SECRET =
  process.env.PAY_SESSION_SECRET ||
  process.env.SESSION_SECRET ||
  (SB_KEY ? crypto.createHash('sha256').update('pay-table|' + SB_KEY).digest('hex') : '');
const COOKIE_NAME = 'pay_session';
const DEFAULT_PASSWORD = '000000';
const BUCKET = 'pay-archives';
const SESSION_HOURS = 8;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      resolve(req.body);
      return;
    }
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 55 * 1024 * 1024) {
        reject(new Error('요청 본문이 너무 큽니다'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('JSON 파싱 실패'));
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const h = req.headers.cookie || '';
  const out = {};
  h.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i < 0) return;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function signSession() {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const payload = Buffer.from(JSON.stringify({ exp, v: 1 }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || !SESSION_SECRET) return false;
  const parts = String(token).split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expect = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || Date.now() > data.exp) return false;
    return true;
  } catch (_) {
    return false;
  }
}

function isAuthed(req) {
  const cookies = parseCookies(req);
  return verifySessionToken(cookies[COOKIE_NAME]);
}

function setSessionCookie(res, token) {
  const maxAge = SESSION_HOURS * 3600;
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
  );
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );
}

function sbConfigured() {
  return Boolean(SB_URL && SB_KEY && SESSION_SECRET);
}

async function sbRest(path, options = {}) {
  if (!sbConfigured()) {
    const err = new Error('서버 Supabase 환경변수 미설정 (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
    err.status = 503;
    throw err;
  }
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const r = await fetch(`${SB_URL}${path}`, { ...options, headers });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = text;
  }
  if (!r.ok) {
    const msg =
      (data && (data.message || data.error_description || data.error || data.msg)) ||
      text ||
      `Supabase ${r.status}`;
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.status = r.status;
    throw err;
  }
  return data;
}

async function getLibraryPasswordFromDb() {
  const data = await sbRest(
    `/rest/v1/pay_settings?key=eq.library_password&select=value&limit=1`
  );
  if (Array.isArray(data) && data[0] && data[0].value) return String(data[0].value);
  // 시드
  try {
    await sbRest(`/rest/v1/pay_settings`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        key: 'library_password',
        value: DEFAULT_PASSWORD,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (_) {}
  return DEFAULT_PASSWORD;
}

function publicObjectUrl(path) {
  if (!path || !SB_URL) return null;
  // path is already ASCII-safe (archives/uuid/file.xlsx)
  return `${SB_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function storageUpload(objectPath, buffer, contentType) {
  if (!sbConfigured()) {
    const err = new Error('서버 Supabase 환경변수 미설정');
    err.status = 503;
    throw err;
  }
  const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': contentType || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: buffer,
  });
  const text = await r.text();
  if (!r.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text);
      msg = j.message || j.error || text;
    } catch (_) {}
    const err = new Error(msg || `Storage upload ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return true;
}

async function storageRemove(paths) {
  if (!paths || !paths.length) return;
  // Supabase Storage API: DELETE with { prefix: "" } not used — body is string[] paths
  const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefixes: paths.map((p) => p) }),
  });
  if (!r.ok) {
    // alternate shape
    await fetch(`${SB_URL}/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paths),
    });
  }
}

function safeSegment(str) {
  const s = String(str || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64);
  return s || 'item';
}

function b64ToBuffer(b64) {
  const cleaned = String(b64 || '').replace(/^data:[^;]+;base64,/, '');
  return Buffer.from(cleaned, 'base64');
}

module.exports = {
  json,
  readBody,
  isAuthed,
  signSession,
  setSessionCookie,
  clearSessionCookie,
  sbConfigured,
  sbRest,
  getLibraryPasswordFromDb,
  publicObjectUrl,
  storageUpload,
  storageRemove,
  safeSegment,
  b64ToBuffer,
  DEFAULT_PASSWORD,
  BUCKET,
  COOKIE_NAME,
};
