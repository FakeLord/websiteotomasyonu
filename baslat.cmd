@echo off
chcp 65001 >nul
title Local Business Finder
cd /d "%~dp0"

echo.
echo  Local Business Finder - web modu
echo  ================================
echo.

echo [1/3] Docker kontrol ediliyor...
docker info >nul 2>&1
if not errorlevel 1 goto dockerok

echo      Docker Desktop kapali, aciliyor (1-2 dakika surebilir)...
if exist "%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe" (
  start "" "%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe"
) else if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
  start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
) else (
  echo      HATA: Docker Desktop bulunamadi. Once kurun: https://www.docker.com/products/docker-desktop
  pause
  exit /b 1
)

set /a tries=0
:waitdocker
docker info >nul 2>&1
if not errorlevel 1 goto dockerok
set /a tries+=1
if %tries% geq 60 goto dockerfail
timeout /t 3 /nobreak >nul
goto waitdocker

:dockerfail
echo      HATA: Docker 3 dakika icinde acilmadi. Docker Desktop'i elle acip tekrar deneyin.
pause
exit /b 1

:dockerok
echo      Docker hazir.
echo.
echo [2/3] Veritabani (Supabase) kontrol ediliyor...
call pnpm exec supabase status >nul 2>&1
if errorlevel 1 (
  echo      Supabase baslatiliyor...
  call pnpm exec supabase start
  if errorlevel 1 (
    echo      HATA: Supabase baslatilamadi.
    pause
    exit /b 1
  )
)
for /f %%c in ('docker ps -a --filter "name=supabase_edge_runtime" --filter "status=exited" --format "{{.Names}}"') do docker start %%c >nul
echo      Veritabani hazir.
echo.

echo [3/3] Uygulama baslatiliyor...
if /i "%~1"=="build" goto build
if not exist "apps\desktop\dist\index.html" goto build
goto run

:build
echo      Arayuz derleniyor (ilk seferde 30-60 sn)...
call pnpm --filter @lbf/desktop build
if errorlevel 1 (
  echo      HATA: Arayuz derlenemedi.
  pause
  exit /b 1
)

:run
if not defined LBF_NO_BROWSER set LBF_OPEN=1
echo.
echo  Tarayici acilacak: http://127.0.0.1:5174
echo  Kapatmak icin bu pencereyi kapatin veya Ctrl+C basin.
echo.
call pnpm --filter @lbf/local-server start
pause