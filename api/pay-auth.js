/**
 * POST { password } → 세션 쿠키 발급
 * GET → 세션 유효 여부
 * DELETE → 로그아웃
 */
const {
  json,
  readBody,
  isAuthed,
  signSession,
  setSessionCookie,
  clearSessionCookie,
  sbConfigured,
  getLibraryPasswordFromDb,
  DEFAULT_PASSWORD,
} = require('./_pay-lib');

function timingSafeEqualStr(a, b) {
  const crypto = require('crypto');
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) {
    // 길이 달라도 비교 연산 시간 유사하게
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return json(res, 200, {
        ok: true,
        authenticated: isAuthed(req),
        configured: sbConfigured(),
      });
    }

    if (req.method === 'DELETE') {
      clearSessionCookie(res);
      return json(res, 200, { ok: true });
    }

    if (req.method !== 'POST') {
      return json(res, 405, { error: 'Method not allowed' });
    }

    if (!sbConfigured()) {
      return json(res, 503, {
        error:
          '서버 환경변수 미설정: Vercel에 SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 를 등록하세요.',
      });
    }

    const body = await readBody(req);
    const password = String(body.password || '').trim();
    if (!password) return json(res, 400, { error: '비밀번호를 입력하세요.' });

    let real;
    try {
      real = await getLibraryPasswordFromDb();
    } catch (e) {
      // DB 장애 시 기본 비번으로 최소한 운영 (복구 경로)
      real = DEFAULT_PASSWORD;
    }

    if (!timingSafeEqualStr(password, real)) {
      return json(res, 401, { error: '비밀번호가 올바르지 않습니다.' });
    }

    const token = signSession();
    setSessionCookie(res, token);
    return json(res, 200, { ok: true, authenticated: true });
  } catch (e) {
    return json(res, e.status || 500, { error: e.message || 'auth error' });
  }
}
