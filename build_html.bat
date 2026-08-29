@echo off
chcp 65001 >nul
echo ===================================================
echo   [BUILD HTML] Mengompilasi Komponen Modular HTML
echo ===================================================
echo.
python scripts\build_html.py
echo.
echo Selesai! File index.html siap digunakan.
timeout /t 3 >nul
