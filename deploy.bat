@echo off
title Zahid School - Cloudflare Deployment
color 0B

echo.
echo  ====================================================
echo    ZAHID SCHOOL MANAGEMENT SYSTEM
echo    Auto-Deploy to Cloudflare Pages
echo  ====================================================
echo.

:: Check if wrangler is installed
where wrangler >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo  [ERROR] Wrangler CLI is not installed!
    echo.
    echo  Please run this command first:
    echo     npm install -g wrangler
    echo.
    pause
    exit /b 1
)

echo  [INFO]  Wrangler found. Starting deployment...
echo  [INFO]  Project : zahid-school
echo  [INFO]  Time    : %DATE% %TIME%
echo.
echo  ----------------------------------------------------
echo  Deploying to Cloudflare Pages...
echo  ----------------------------------------------------
echo.

wrangler deploy

if %ERRORLEVEL% EQU 0 (
    color 0A
    echo.
    echo  ====================================================
    echo    [SUCCESS] Deployment complete!
    echo    Visit: https://zahid-school.pages.dev
    echo  ====================================================
) else (
    color 0C
    echo.
    echo  ====================================================
    echo    [FAILED] Deployment encountered an error.
    echo    Check the output above for details.
    echo  ====================================================
)

echo.
pause
