@echo off
title DRISHTI GCS - Rotax 914 Engine Digital Twin

rem Always run from the folder this .bat lives in (matters when launched
rem via "Run as administrator", where the working dir is System32).
cd /d "%~dp0"

echo ============================================================
echo  DRISHTI GCS - Rotax 914 MALE UAV Engine Digital Twin
echo ============================================================
echo.

rem ---- Locate Python -----------------------------------------------------
set "PYTHON_CMD="
where py >nul 2>nul && set "PYTHON_CMD=py"
if not defined PYTHON_CMD where python >nul 2>nul && set "PYTHON_CMD=python"

if not defined PYTHON_CMD (
    echo [ERROR] Python was not found in PATH.
    echo.
    echo Install Python 3 from https://www.python.org/downloads/
    echo IMPORTANT: tick "Add python.exe to PATH" on the first installer screen.
    echo.
    echo Falling back to opening index.html directly in the browser...
    start "" index.html
    pause
    exit /b 1
)

echo Starting DRISHTI GCS server...
echo Console output is written to server.log for diagnosis.
echo.

rem ---- Run with auto-restart ---------------------------------------------
rem If the server process dies within seconds of launch (typical causes:
rem antivirus interference or a OneDrive sync lock), retry a few times so a
rem transient kill does not leave you with a dead "can't reach this page"
rem browser window and no explanation.
set /a TRIES=0
:restart
set /a TRIES+=1
%PYTHON_CMD% server.py > server.log 2>&1
if %ERRORLEVEL% NEQ 0 (
    if %TRIES% LSS 5 (
        echo [WARN]  Server exited unexpectedly - attempt %TRIES% of 5. Restarting in 2s...
        timeout /t 2 /nobreak >nul
        goto restart
    )
    echo.
    echo [ERROR] The server kept crashing after 5 attempts.
    echo         Last lines of server.log:
    echo ------------------------------------------------------------
    powershell -NoProfile -Command "if (Test-Path server.log) { Get-Content server.log -Tail 15 } else { 'server.log was not created.' }"
    echo ------------------------------------------------------------
    echo.
    echo If your antivirus flagged this file, choose "Allow" / add an
    echo exclusion for this folder, then run run.bat again.
    pause
    exit /b 1
)

echo Server stopped normally. Goodbye!
pause
