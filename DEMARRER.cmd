@echo off
setlocal
cd /d "%~dp0"
title TVA Cabinet - Lancement local
where node >nul 2>nul
if errorlevel 1 (
  echo Installez Node.js 24 LTS depuis https://nodejs.org/ puis relancez ce fichier.
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])!==24){console.error('Node.js 24 LTS est requis.');process.exit(1)}"
if errorlevel 1 (
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installation initiale des outils. Internet est necessaire uniquement pour cette etape.
  call npm ci
  if errorlevel 1 (
    echo Installation interrompue. Verifiez votre connexion puis relancez.
    pause
    exit /b 1
  )
)
if not exist dist\index.html (
  echo Preparation de l'interface...
  call npm run build
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node scripts\launch.mjs
pause
