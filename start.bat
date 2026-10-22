@echo off
rem Starts a local web server for this folder and opens the game in the browser.
rem (Browsers block loading the bundled songs when index.html is opened directly.)
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Please install Python 3 from https://www.python.org/
  pause
  exit /b 1
)
start "" http://localhost:8123/
echo Game server is running at http://localhost:8123/
echo Close this window to stop it.
python tools\serve.py 8123
