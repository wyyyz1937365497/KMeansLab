@echo off
setlocal
set "installer=%~dp0MicrosoftEdgeWebView2RuntimeInstallerX64.exe"
if not exist "%installer%" (
  echo Missing MicrosoftEdgeWebView2RuntimeInstallerX64.exe.
  pause
  exit /b 1
)
start "" /wait "%installer%" /silent /install
if errorlevel 1 (
  echo WebView2 installation failed with code %errorlevel%.
  pause
  exit /b %errorlevel%
)
echo WebView2 is ready. Run KMeansLab\KMeansLab.exe.
pause
