@echo off
:: run-upload-stock.bat
:: ใช้สำหรับ Task Scheduler รัน upload-stock.mjs ทุก 5 นาที
:: วาง .bat นี้ไว้ในโฟลเดอร์เดียวกับ upload-stock.mjs

cd /d "%~dp0"
node upload-stock.mjs >> "%~dp0upload-stock.log" 2>&1
