<#
.SYNOPSIS
  Şifreli haftalık yedeği (backup-YYYYMMDD.dump.gpg) çözer ve geçici bir Postgres'e geri yükleyerek PROVA yapar.

.DESCRIPTION
  ADR 0026. Docker gerekir (gpg, pg_restore ve psql docker imajından kullanılır; bilgisayara ayrıca kurmanız gerekmez).
  Yedeğin parolası komut satırına yazılmaz: sorulur (ya da LBF_BACKUP_PASSPHRASE ortam değişkeninden okunur).

  Varsayılan: tek kullanımlık yerel bir Supabase Postgres kapsayıcısı açar, yedeği oraya yükler, tablo satır sayılarını
  yazar ve kapsayıcıyı siler. Gerçek bir veriye dokunmaz.

.PARAMETER BackupFile
  İndirdiğiniz şifreli yedek dosyası (GitHub Actions → db-backup çıktısı).

.PARAMETER Keep
  Prova bitince kapsayıcıyı silme; veritabanını incelemek için açık bırakır (localhost:54329, kullanıcı supabase_admin).

.EXAMPLE
  .\scripts\ops\restore-backup.ps1 -BackupFile C:\Yedekler\backup-20261012.dump.gpg
#>
param(
  [Parameter(Mandatory = $true)][string]$BackupFile,
  [switch]$Keep,
  [string]$Image = "public.ecr.aws/supabase/postgres:17.6.1.171",
  [int]$Port = 54329
)

# Docker/psql bilgi iletilerini (NOTICE) stderr'e yazar; PowerShell 5.1 bunu hata sayıp betiği keserdi. Hatalar
# $LASTEXITCODE ile açıkça denetlenir.
$ErrorActionPreference = "Continue"

function Step($text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host "HATA: $text" -ForegroundColor Red; exit 1 }

if (-not (Test-Path -LiteralPath $BackupFile)) { Fail "Yedek dosyası bulunamadı: $BackupFile" }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail "Docker bulunamadı. Docker Desktop'ı kurup açın." }
docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail "Docker çalışmıyor. Docker Desktop'ı açıp tekrar deneyin." }

# --- Parola ---------------------------------------------------------------------------------------------
if (-not $env:LBF_BACKUP_PASSPHRASE) {
  $secure = Read-Host -AsSecureString "Yedek parolası"
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $env:LBF_BACKUP_PASSPHRASE = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

$work = Join-Path ([IO.Path]::GetTempPath()) ("lbf-restore-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $work -ErrorAction Stop | Out-Null
$container = "lbf-restore-test"

try {
  # --- 1) Şifre çöz -------------------------------------------------------------------------------------
  Step "Yedek çözülüyor"
  Copy-Item -LiteralPath $BackupFile -Destination (Join-Path $work "backup.dump.gpg") -ErrorAction Stop
  docker run --rm -e LBF_BACKUP_PASSPHRASE -v "${work}:/work" postgres:17 sh -c 'printf "%s" "$LBF_BACKUP_PASSPHRASE" | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 --decrypt -o /work/restore.dump /work/backup.dump.gpg'
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $work "restore.dump"))) { Fail "Yedek çözülemedi (parola yanlış ya da dosya bozuk)." }
  Remove-Item (Join-Path $work "backup.dump.gpg") -Force
  Write-Host "Yedek çözüldü."

  # --- 2) Geçici veritabanı ------------------------------------------------------------------------------
  Step "Geçici veritabanı açılıyor ($Image)"
  docker rm -f $container *> $null
  $password = [Guid]::NewGuid().ToString("N")
  docker run -d --name $container -e POSTGRES_PASSWORD=$password -p "${Port}:5432" $Image *> $null
  if ($LASTEXITCODE -ne 0) { Fail "Geçici veritabanı başlatılamadı (port $Port dolu olabilir)." }

  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    docker exec -e PGPASSWORD=$password $container pg_isready -U supabase_admin -h 127.0.0.1 *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 2
  }
  if (-not $ready) { Fail "Geçici veritabanı hazır olmadı." }
  Start-Sleep -Seconds 3

  # --- 3) Geri yükle -------------------------------------------------------------------------------------
  Step "Yedek geri yükleniyor"
  # Supabase imajında auth/public şemaları boş olarak hazırdır; yedek bunların tam içeriğini (tablo + veri + işlevler)
  # taşıdığı için önce temizlenir (yalnızca bu geçici kapsayıcıda). Uzantılar yedeğe girmez; indeksler pg_trgm ister.
  docker exec -e PGPASSWORD=$password $container psql -U supabase_admin -h 127.0.0.1 -d postgres -v ON_ERROR_STOP=1 -c "drop schema if exists auth cascade; drop schema if exists public cascade; create extension if not exists pg_trgm with schema extensions; create extension if not exists pgcrypto with schema extensions;" *> $null
  if ($LASTEXITCODE -ne 0) { Fail "Geçici veritabanı hazırlanamadı." }
  docker cp (Join-Path $work "restore.dump") "${container}:/tmp/restore.dump"
  $restoreLog = docker exec -e PGPASSWORD=$password $container sh -c "pg_restore --no-owner --no-privileges -U supabase_admin -h 127.0.0.1 -d postgres /tmp/restore.dump 2>&1"
  docker exec -e PGPASSWORD=$password $container rm -f /tmp/restore.dump *> $null
  $errors = @($restoreLog | Where-Object { $_ -match "error:" })
  if ($errors.Count -gt 0) {
    Write-Host ("pg_restore {0} hata bildirdi (ilk 10):" -f $errors.Count) -ForegroundColor Yellow
    $errors | Select-Object -First 10 | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
  } else {
    Write-Host "pg_restore hatasız tamamlandı."
  }

  # --- 4) Doğrula -----------------------------------------------------------------------------------------
  Step "Satır sayıları"
  $tables = @(
    "auth.users", "public.profiles", "public.workspaces", "public.workspace_members", "public.businesses",
    "public.contact_channels", "public.conversations", "public.messages", "public.follow_ups",
    "public.customer_deals", "public.customer_services", "public.customer_documents", "public.suppressions",
    "public.activity_logs"
  )
  $failed = $false
  foreach ($t in $tables) {
    $count = docker exec -e PGPASSWORD=$password $container psql -U supabase_admin -h 127.0.0.1 -d postgres -At -c "select count(*) from $t"
    if ($LASTEXITCODE -ne 0) { Write-Host ("{0,-32} TABLO YOK" -f $t) -ForegroundColor Yellow; continue }
    Write-Host ("{0,-32} {1}" -f $t, $count)
  }
  $ws = docker exec -e PGPASSWORD=$password $container psql -U supabase_admin -h 127.0.0.1 -d postgres -At -c "select count(*) from public.workspaces"
  if ([int]$ws -lt 1) { $failed = $true; Write-Host "Uyarı: yedekte hiç workspace yok." -ForegroundColor Yellow }
  if ($errors.Count -gt 0) { $failed = $true }

  Step "Sonuç"
  if ($failed) { Fail "Geri yükleme hata veya eksik veriyle tamamlandı; yukarıdaki satırlara bakın." }
  Write-Host "Geri yükleme provası BAŞARILI." -ForegroundColor Green
  Write-Host "Not: Vault sırları (API anahtarları), Storage dosyaları ve Edge Function'lar yedekte yoktur; docs/ops/geri-yukleme.md."
  if ($Keep) { Write-Host "Kapsayıcı açık: localhost:$Port, kullanıcı supabase_admin, parola: $password" }
}
finally {
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
  if (-not $Keep) { docker rm -f $container *> $null }
  Remove-Item Env:\LBF_BACKUP_PASSPHRASE -ErrorAction SilentlyContinue
}
