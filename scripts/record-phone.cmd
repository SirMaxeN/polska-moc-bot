@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Nie znaleziono Node.js. Zainstaluj Node.js i otworz ponownie terminal.
  exit /b 1
)
pushd "%~dp0.."
node "%~dp0record-phone.js" %*
set "record_result=%errorlevel%"
popd
exit /b %record_result%
