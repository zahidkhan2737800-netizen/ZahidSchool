@echo off
echo Starting Cloudflare Pages Deployment for Zahid School...
wrangler pages deploy . --project-name zahid-school --commit-dirty=true
echo Deployment Finished!
pause
