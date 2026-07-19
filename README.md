# 깡비서 급여조견표 생성기

급여테이블(변경후) 엑셀 → 직무별 조견표 PNG/ZIP 생성  
**Supabase**에 원본 엑셀·조견표 ZIP을 센터별로 저장하고, 검색·재다운로드합니다.

- 사이트 예: https://pay-table-ten.vercel.app/
- 업로드 파일은 브라우저 → Supabase Storage로 저장 (링크 아는 사람 접근 가능 설정)

---

## 기능

1. 엑셀 업로드 → 직무 선택 → 조견표 생성 → PNG/ZIP 다운로드  
2. **자동 저장**: 업로드 엑셀 + ZIP 생성 시 클라우드 보관  
3. **센터별** 필터 · 칩  
4. **전체 검색** (센터명, 파일명, 직무 등)  
5. 목록에서 엑셀 / 조견표 ZIP 재다운로드  

---

## Supabase 설정 (최초 1회)

### 1) 프로젝트 생성
1. https://supabase.com 로그인 → New project  
2. **Project Settings → API** 에서  
   - Project URL  
   - `anon` `public` key  
   복사

### 2) SQL 실행
1. Supabase → **SQL Editor**  
2. 이 저장소의 `supabase/schema.sql` 전체 붙여넣기 → Run  

### 3) config.js 작성
```bash
# 로컬
copy config.example.js config.js
```

`config.js` 내용:
```js
window.SUPABASE_URL = 'https://xxxx.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

### 4) Vercel 배포
프로젝트에 다음 파일이 포함되어야 합니다.

- `index.html`
- `config.js`  ← **키 포함 (공개 anon 키, RLS로 제어)**
- (선택) `README.md`, `.nojekyll`

Vercel에 푸시/재배포 후 사이트에서:
- 상단 **저장된 자료** 목록이 뜨는지 확인  
- 엑셀 업로드 시 “클라우드 저장 완료” 메시지 확인  
- ZIP 생성 후 목록에 “조견표 ZIP” 버튼 생기는지 확인  

---

## 보안 안내

현재 설정은 **링크를 아는 누구나** 저장 목록을 보고 파일에 접근할 수 있습니다.  
급여 자료이므로, 나중에 로그인/비밀번호 제한을 넣는 것을 권장합니다.

---

## 로컬 실행

`index.html`을 브라우저로 열거나, 폴더에서 간단 서버:

```bash
npx serve .
```

`config.js`가 비어 있으면 조견표 생성은 되지만 클라우드 저장은 되지 않습니다.
