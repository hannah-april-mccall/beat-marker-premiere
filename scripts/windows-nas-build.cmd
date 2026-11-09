@echo off
setlocal EnableExtensions
set "bm_share=%~dp0"
set "bm_build=%LOCALAPPDATA%\BeatMarkerBuilds\0.6.0"
if not exist "%bm_build%" mkdir "%bm_build%"
copy /y "%bm_share%windows-build-input.zip" "%bm_build%\windows-build-input.zip" >nul
if errorlevel 1 exit /b 1
cd /d "%bm_build%"
tar -xf windows-build-input.zip
if errorlevel 1 exit /b 1
call build-local.cmd >build.log 2>&1
set "bm_status=%errorlevel%"
copy /y build.log "%bm_share%windows-build.log" >nul
if not "%bm_status%"=="0" (
  type build.log
  exit /b 1
)
if not exist "%bm_share%windows-dist" mkdir "%bm_share%windows-dist"
copy /y dist\* "%bm_share%windows-dist\" >nul
echo Installer copied to the Unit3 Beat Marker test folder.
