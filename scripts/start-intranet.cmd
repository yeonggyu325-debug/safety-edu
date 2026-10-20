@echo off
cd /d "%~dp0.."
node server/server.cjs --lan
if errorlevel 1 pause
