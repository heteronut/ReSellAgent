@echo off
title ReSell AI Agent
color 0A

echo.
echo  ========================================
echo   ReSell AI Agent - Starting...
echo  ========================================
echo.

:: Cek apakah node tersedia
where node >nul 2>&1
if errorlevel 1 (
  echo  [ERROR] Node.js tidak ditemukan.
  echo  Unduh di: https://nodejs.org
  pause
  exit /b 1
)

:: Cek apakah node_modules sudah ada, jika belum install otomatis
if not exist "%~dp0backend\node_modules\" (
  echo  [INFO] Dependensi belum terinstall. Menjalankan npm install...
  cd /d "%~dp0backend"
  npm install
  cd /d "%~dp0"
)

:: Jalankan backend di jendela baru agar tetap berjalan
echo  [INFO] Menjalankan backend di port 3000...
start "ReSell AI Backend" cmd /k "cd /d "%~dp0backend" && node server.js"

:: Tunggu 2 detik agar server sempat siap
timeout /t 2 /nobreak >nul

:: Buka browser ke localhost:3000
echo  [INFO] Membuka aplikasi di browser...
start http://localhost:3000

echo.
echo  ========================================
echo   Backend berjalan di http://localhost:3000
echo   Tutup jendela "ReSell AI Backend" untuk mematikan server.
echo  ========================================
echo.
pause
