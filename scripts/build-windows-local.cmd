@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if not exist dist mkdir dist
if not exist .private mkdir .private
if not exist .private\certificate-password.txt (
  set "bm_password=%RANDOM%%RANDOM%%RANDOM%%RANDOM%%RANDOM%%RANDOM%%RANDOM%%RANDOM%"
) else (
  set /p bm_password=<.private\certificate-password.txt
)
if not exist .private\certificate-password.txt >.private\certificate-password.txt echo %bm_password%
if not exist .private\beat-marker-cep.p12 (
  tools\ZXPSignCmd.exe -selfSignedCert GB UK "Beat Marker" "Beat Marker CEP Releases" "%bm_password%" .private\beat-marker-cep.p12 -validityDays 3650
  if errorlevel 1 goto failed
)
if exist dist\beat-marker-premiere-0.6.0-windows-x64.zxp del dist\beat-marker-premiere-0.6.0-windows-x64.zxp
tools\ZXPSignCmd.exe -sign extension dist\beat-marker-premiere-0.6.0-windows-x64.zxp .private\beat-marker-cep.p12 "%bm_password%" -tsa http://timestamp.digicert.com
if errorlevel 1 goto failed
tools\ZXPSignCmd.exe -verify dist\beat-marker-premiere-0.6.0-windows-x64.zxp -certInfo >dist\adobe-signature-windows.txt 2>&1
if errorlevel 1 goto failed
if exist signed-extension rmdir /s /q signed-extension
mkdir signed-extension
tar -xf dist\beat-marker-premiere-0.6.0-windows-x64.zxp -C signed-extension
if errorlevel 1 goto failed
tools\ZXPSignCmd.exe -verify signed-extension >>dist\adobe-signature-windows.txt 2>&1
if errorlevel 1 goto failed
tools\nsis\makensis.exe /V2 installer.nsi
if errorlevel 1 goto failed
certutil -hashfile dist\beat-marker-premiere-0.6.0-windows-x64-setup.exe SHA256 >dist\setup-windows-sha256.txt
echo Windows installer built and Adobe signatures verified.
exit /b 0
:failed
echo Build failed. Do not share this build as verified.
exit /b 1
