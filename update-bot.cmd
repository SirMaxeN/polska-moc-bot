@echo off
setlocal
cd /d "%~dp0"
node scripts\deploy.js %*
set "DEPLOY_RESULT=%ERRORLEVEL%"
echo.
echo ========================================
if "%DEPLOY_RESULT%"=="0" (
    echo RESULT: SUCCESS
    echo The operation completed successfully.
) else (
    echo RESULT: FAILED - exit code %DEPLOY_RESULT%
    echo Update stopped. Read the message above.
)
echo ========================================
echo.
:wait_for_exit
set "DEPLOY_ACTION="
set /p "DEPLOY_ACTION=Type EXIT and press Enter to close: "
if /I not "%DEPLOY_ACTION%"=="exit" goto wait_for_exit
exit /b %DEPLOY_RESULT%
