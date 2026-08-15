@echo off
title Server Jadwal Kuliah UNAMA - Auto Starter
echo ===================================================
echo   MEMULAI SERVER JADWAL KULIAH UNAMA SECARA OTOMATIS
echo ===================================================

echo [1/4] Menjalankan MySQL Database...
net start mysql >nul 2>&1
if exist "C:\xampp\mysql_start.bat" (
    start "" "C:\xampp\mysql_start.bat"
)

timeout /t 3 >nul

echo [2/4] Menjalankan WhatsApp Bot Server (Node.js)...
cd /d "%~dp0wa-bot"
start "WA Bot UNAMA" /min cmd /c "node server.js"

timeout /t 2 >nul

echo [3/4] Menjalankan Backend FastAPI (Python)...
cd /d "%~dp0"
start "FastAPI Backend" /min cmd /c "uvicorn main:app --host 0.0.0.0 --port 8000"

timeout /t 5 >nul

echo [4/4] Membuka Dashboard Display di Google Chrome (Kiosk Mode)...
start chrome.exe --kiosk "http://localhost:8000"

echo Selesai! Server dan Dashboard sudah aktif.
exit
