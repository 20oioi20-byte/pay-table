/**
 * 급여 아카이브/설정/파일 프록시 — 세션 쿠키 필수
 * body: { action, ... }
 */
const {
  json,
  readBody,
  isAuthed,
  sbConfigured,
  sbRest,
  getLibraryPasswordFromDb,
  publicObjectUrl,
  storageUpload,
  storageRemove,
  safeSegment,
  b64ToBuffer,
  DEFAULT_PASSWORD,
} = require('./_pay-lib');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return json(res, 405, { error: 'Method not allowed' });
    }
    if (!sbConfigured()) {
      return json(res, 503, {
        error:
          '서버 환경변수 미설정: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 를 Vercel에 등록하세요.',
      });
    }
    if (!isAuthed(req)) {
      return json(res, 401, { error: '인증이 필요합니다. 저장된 자료 탭에서 비밀번호를 입력하세요.' });
    }

    const body = await readBody(req);
    const action = body.action;

    switch (action) {
      case 'count': {
        const list = await sbRest(`/rest/v1/pay_archives?select=id&limit=1000`);
        const count = Array.isArray(list) ? list.length : 0;
        return json(res, 200, { count });
      }

      case 'list': {
        const data = await sbRest(
          `/rest/v1/pay_archives?select=*&order=created_at.desc&limit=500`
        );
        const rows = (Array.isArray(data) ? data : []).map((r) => ({
          ...r,
          excel_url: publicObjectUrl(r.excel_path),
          zip_url: publicObjectUrl(r.zip_path),
        }));
        return json(res, 200, { rows });
      }

      case 'insert_archive': {
        // storage + db
        const id =
          body.id ||
          (crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
        const center = body.center_name || '미상센터';
        const excelPath = `archives/${safeSegment(id)}/original.xlsx`;
        if (!body.file_base64) return json(res, 400, { error: 'file_base64 required' });
        const buf = b64ToBuffer(body.file_base64);
        await storageUpload(
          excelPath,
          buf,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        const row = {
          id,
          center_name: center,
          original_filename: body.original_filename || 'original.xlsx',
          excel_path: excelPath,
          zip_path: null,
          job_count: body.job_count || 0,
          png_count: 0,
          sheet_name: body.sheet_name || '',
          search_text: body.search_text || '',
        };
        const data = await sbRest(`/rest/v1/pay_archives`, {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(row),
        });
        const saved = Array.isArray(data) ? data[0] : data;
        return json(res, 200, { row: saved });
      }

      case 'update_zip': {
        const archiveId = body.id;
        if (!archiveId) return json(res, 400, { error: 'id required' });
        if (!body.file_base64) return json(res, 400, { error: 'file_base64 required' });
        const zipPath = `archives/${safeSegment(archiveId)}/pay_tables.zip`;
        const buf = b64ToBuffer(body.file_base64);
        await storageUpload(zipPath, buf, 'application/zip');
        const data = await sbRest(
          `/rest/v1/pay_archives?id=eq.${encodeURIComponent(archiveId)}`,
          {
            method: 'PATCH',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({
              zip_path: zipPath,
              png_count: body.png_count || 0,
            }),
          }
        );
        const saved = Array.isArray(data) ? data[0] : data;
        return json(res, 200, { row: saved });
      }

      case 'delete': {
        const id = body.id;
        if (!id) return json(res, 400, { error: 'id required' });
        const paths = [body.excel_path, body.zip_path].filter(Boolean);
        if (paths.length) {
          try {
            await storageRemove(paths);
          } catch (_) {}
        }
        await sbRest(`/rest/v1/pay_archives?id=eq.${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { Prefer: 'return=minimal' },
        });
        return json(res, 200, { ok: true });
      }

      case 'set_password': {
        const current = String(body.current || '').trim();
        const next = String(body.next || '').trim();
        if (!current || !next) return json(res, 400, { error: '현재/새 비밀번호 필요' });
        if (next.length < 4) return json(res, 400, { error: '새 비밀번호는 4자 이상' });
        const real = await getLibraryPasswordFromDb();
        if (current !== real) return json(res, 401, { error: '현재 비밀번호가 올바르지 않습니다.' });
        await sbRest(`/rest/v1/pay_settings`, {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({
            key: 'library_password',
            value: next,
            updated_at: new Date().toISOString(),
          }),
        });
        return json(res, 200, { ok: true });
      }

      default:
        return json(res, 400, { error: 'unknown action: ' + action });
    }
  } catch (e) {
    return json(res, e.status || 500, { error: e.message || 'storage error' });
  }
}
