# pay-table → GitHub push (Vercel 자동 배포)
# 사용: 수정 후 이 스크립트 실행, 또는 Grok이 작업 후 자동 실행
$ErrorActionPreference = "Stop"
$repo = "C:\Users\user\Documents\GitHub\pay-table"
$src  = "C:\Users\user\Documents\pay-table-generator"

if (Test-Path $src) {
  Copy-Item -Force "$src\index.html" "$repo\index.html" -ErrorAction SilentlyContinue
  if (Test-Path "$src\config.js") { Copy-Item -Force "$src\config.js" "$repo\config.js" }
  if (Test-Path "$src\supabase") {
    New-Item -ItemType Directory -Force -Path "$repo\supabase" | Out-Null
    Copy-Item -Force -Recurse "$src\supabase\*" "$repo\supabase\"
  }
}

Set-Location $repo
git add -A
$status = git status --porcelain
if (-not $status) {
  Write-Host "변경 없음 — push 생략"
  exit 0
}
$msg = $args[0]
if (-not $msg) { $msg = "Update pay-table $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }
git commit -m $msg
git push origin main
Write-Host "push 완료 → Vercel 배포 대기"
