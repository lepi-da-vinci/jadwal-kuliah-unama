@echo off
title Server Jadwal Kuliah UNAMA (Docker Mode) - Auto Starter
echo ===================================================
echo   MEMULAI SERVER DOCKER JADWAL KULIAH UNAMA
echo ===================================================

echo [1/2] Menjalankan Docker Compose Containers...
cd /d "%~dp0"
docker compose up -d

timeout /t 8 >nul

echo [2/2] Membuka Dashboard Display di Google Chrome (Kiosk Mode)...
start chrome.exe --kiosk "http://localhost:8000"

echo Selesai! Server Docker dan Dashboard sudah aktif.
exit
