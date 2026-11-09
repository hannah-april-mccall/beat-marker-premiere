Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "StrFunc.nsh"
${StrStr}
${UnStrStr}
Name "Beat Marker for Premiere Pro"
OutFile "dist\beat-marker-premiere-0.6.0-windows-x64-setup.exe"
InstallDir "$APPDATA\Adobe\CEP\extensions\com.hannah.beatmarker"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "Beat Marker 0.6.0"
!define MUI_WELCOMEPAGE_TEXT "Install Beat Marker and its complete offline analysis engine for your Windows user account.$\r$\n$\r$\nQuit Premiere Pro before continuing. Python, FFmpeg and PlayerDebugMode setup are not required."
!define MUI_FINISHPAGE_TEXT "Open Premiere Pro and choose Window > Extensions > Beat Marker."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Var Previous
Var Staging
Var Stamp

!macro CheckPremiere STRFUNC
  nsExec::ExecToStack '"$SYSDIR\tasklist.exe" /FI "IMAGENAME eq Adobe Premiere Pro.exe" /NH'
  Pop $0
  Pop $1
  ${${STRFUNC}} $2 $1 "Adobe Premiere Pro.exe"
  ${If} $2 != ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "Quit Premiere Pro, then run this installer again."
    Abort
  ${EndIf}
!macroend
Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "This installer requires an Intel or AMD 64-bit Windows PC."
    Abort
  ${EndIf}
  !insertmacro CheckPremiere StrStr
FunctionEnd
Function un.onInit
  !insertmacro CheckPremiere UnStrStr
FunctionEnd

Section "Install"
  SetShellVarContext current
  System::Call 'kernel32::GetTickCount() i.r9'
  StrCpy $Stamp $9
  StrCpy $Staging "$INSTDIR.install-$Stamp"
  StrCpy $Previous ""
  SetOutPath "$Staging"
  File /r "signed-extension\*"
  nsExec::ExecToStack '"$Staging\runtime\engine\beat-marker-engine.exe" --version'
  Pop $0
  Pop $1
  ; Release the staged directory before renaming it on Windows.
  SetOutPath "$TEMP"
  ${If} $0 != "0"
    RMDir /r "$Staging"
    MessageBox MB_OK|MB_ICONSTOP "The bundled analysis engine could not start. Nothing was replaced.$\r$\n$1"
    Abort
  ${EndIf}
  CreateDirectory "$APPDATA\Beat Marker\Premiere\jobs"
  IfFileExists "$INSTDIR\CSXS\manifest.xml" 0 newInstall
    FileOpen $0 "$INSTDIR\CSXS\manifest.xml" r
    FileRead $0 $1
    FileRead $0 $1
    FileClose $0
    ${StrStr} $2 $1 'ExtensionBundleId="com.hannah.beatmarker"'
    ${If} $2 == ""
      RMDir /r "$Staging"
      MessageBox MB_OK|MB_ICONSTOP "The destination contains an unrecognised extension. Nothing was replaced."
      Abort
    ${EndIf}
    IfFileExists "$APPDATA\Beat Marker\Premiere\jobs\last-marker-write.json" +2 0
      CopyFiles /SILENT "$INSTDIR\jobs\last-marker-write.json" "$APPDATA\Beat Marker\Premiere\jobs"
    IfFileExists "$APPDATA\Beat Marker\Premiere\jobs\last-edit-alignment.json" +2 0
      CopyFiles /SILENT "$INSTDIR\jobs\last-edit-alignment.json" "$APPDATA\Beat Marker\Premiere\jobs"
    CreateDirectory "$APPDATA\Beat Marker\Premiere\installation-backups"
    StrCpy $Previous "$APPDATA\Beat Marker\Premiere\installation-backups\0.6.0-$Stamp"
    ClearErrors
    Rename "$INSTDIR" "$Previous"
    ${If} ${Errors}
      RMDir /r "$Staging"
      MessageBox MB_OK|MB_ICONSTOP "The previous installation could not be backed up. Nothing was replaced."
      Abort
    ${EndIf}
  newInstall:
  ClearErrors
  Rename "$Staging" "$INSTDIR"
  ${If} ${Errors}
    ${If} $Previous != ""
      Rename "$Previous" "$INSTDIR"
    ${EndIf}
    RMDir /r "$Staging"
    MessageBox MB_OK|MB_ICONSTOP "Installation failed. The previous extension was restored where available."
    Abort
  ${EndIf}
  SetOutPath "$APPDATA\Beat Marker\Premiere"
  WriteUninstaller "$APPDATA\Beat Marker\Premiere\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeatMarkerPremiere" "DisplayName" "Beat Marker for Premiere Pro"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeatMarkerPremiere" "DisplayVersion" "0.6.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeatMarkerPremiere" "Publisher" "Hannah McCall"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeatMarkerPremiere" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeatMarkerPremiere" "UninstallString" '$\"$APPDATA\Beat Marker\Premiere\Uninstall.exe$\"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeatMarkerPremiere" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeatMarkerPremiere" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  StrCpy $INSTDIR "$APPDATA\Adobe\CEP\extensions\com.hannah.beatmarker"
  IfFileExists "$INSTDIR\CSXS\manifest.xml" 0 removed
    FileOpen $0 "$INSTDIR\CSXS\manifest.xml" r
    FileRead $0 $1
    FileRead $0 $1
    FileClose $0
    ${UnStrStr} $2 $1 'ExtensionBundleId="com.hannah.beatmarker"'
    ${If} $2 == ""
      MessageBox MB_OK|MB_ICONSTOP "The destination is not a recognised Beat Marker installation."
      Abort
    ${EndIf}
    System::Call 'kernel32::GetTickCount() i.r9'
    CreateDirectory "$APPDATA\Beat Marker\Premiere\uninstalled-extensions"
    Rename "$INSTDIR" "$APPDATA\Beat Marker\Premiere\uninstalled-extensions\$9"
    IfErrors 0 removed
      MessageBox MB_OK|MB_ICONSTOP "Beat Marker could not be removed. Close Premiere and try again."
      Abort
  removed:
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BeatMarkerPremiere"
  Delete "$APPDATA\Beat Marker\Premiere\Uninstall.exe"
SectionEnd
