# pay-table 보안 전환 설정 가이드

## 무엇이 바뀌었나

| 이전 | 이후 |
|------|------|
| `config.js`에 anon key 노출 | 브라우저에 키 없음 |
| 브라우저 → Supabase 직접 CRUD | 브라우저 → `/api/*` → 서버만 Supabase 접근 |
| 자료 탭 비번 = 클라이언트 비교 | 자료 탭 비번 = 서버 검증 + HttpOnly 세션 쿠키 |

**UI/조견표 계산 로직은 그대로**입니다.  
**RLS 정책은 아직 변경하지 않았습니다** (문서 지시: 프록시 검증 후 별도 승인).

## UX (요청안 유지)

- 조견표 생성 화면: 바로 사용 가능
- 클라우드 저장·목록·삭제: **「저장된 자료」탭 비밀번호 확인 후** 세션 발급
- 비밀번호 미확인 상태에서도 엑셀 파싱·PNG 생성은 로컬로 동작

## Vercel 환경변수 (필수)

1. https://vercel.com → 프로젝트 `pay-table` (또는 해당 프로젝트)
2. **Settings → Environment Variables**
3. 추가:

```
SUPABASE_URL = https://zbiwyqwjehnogxkzlhxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY = (아래 확인 방법)
PAY_SESSION_SECRET = (아무 긴 랜덤 문자열, 예: openssl rand -hex 32)
```

4. **Production / Preview** 모두 체크 후 Save  
5. **Redeploy** (환경변수는 재배포 후 적용)

### service_role 키 확인 방법

1. https://supabase.com/dashboard 로그인  
2. 프로젝트 선택 (`zbiwyqwjehnogxkzlhxx`)  
3. 왼쪽 하단 **Project Settings (톱니)**  
4. **API**  
5. **Project API keys**  
   - `anon` `public` → 더 이상 프론트에 넣지 않음  
   - **`service_role` `secret`** → **Reveal** 후 복사 → Vercel `SUPABASE_SERVICE_ROLE_KEY`  
6. **절대** GitHub/채팅/config.js에 넣지 마세요

## 배포 후 스모크 테스트

1. 사이트 강력 새로고침 (Ctrl+F5)  
2. 개발자도구 → Network → `config.js` 또는 페이지 소스에 `eyJ` 키 없어야 함  
3. 조견표 생성: 엑셀 업로드 → 직무 선택 → PNG (로컬 동작)  
4. 저장된 자료 탭 → 비밀번호 → 목록 표시  
5. 비번 입력 후 엑셀 재업로드 → "클라우드 저장 완료"  
6. ZIP 생성 → 클라우드 ZIP 저장  
7. 목록에서 엑셀/ZIP 다운로드·삭제  

## 아직 하지 말 것 (문서 지시)

- Supabase RLS 정책 삭제/강화 → **프록시 검증 완료 후 별도 승인**  
- Production 데이터 삭제  

## 백업 권장 (작업 전)

Supabase Table Editor → `pay_archives`, `pay_settings` → Export CSV
