; Citekeep installer: per-user install, no admin rights needed
Unicode true
!define APPNAME "Citekeep"
!define VERSION "30.0.0"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Citekeep"

Name "${APPNAME}"
OutFile "Citekeep Setup V30.exe"
InstallDir "$LOCALAPPDATA\Programs\Citekeep"
InstallDirRegKey HKCU "Software\Citekeep" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
Icon "citekeep.ico"
UninstallIcon "citekeep.ico"
BrandingText "Citekeep V30"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "Citekeep"
VIAddVersionKey "FileDescription" "Citekeep Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "Marc Ross"

!include "MUI2.nsh"
!include "LogicLib.nsh"
!define MUI_ICON "citekeep.ico"
!define MUI_UNICON "citekeep.ico"
!define MUI_WELCOMEPAGE_TITLE "Install Citekeep V30"
!define MUI_WELCOMEPAGE_TEXT "Citekeep will be installed for your Windows account only, so no administrator password is needed.$\r$\n$\r$\nYour library and settings stay in Documents\Citekeep and are never touched by installing, updating, or uninstalling.$\r$\n$\r$\nIf Citekeep is open, the installer closes it for you; your library is saved first."
!define MUI_FINISHPAGE_RUN "$INSTDIR\Citekeep.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Open Citekeep now"
!insertmacro MUI_PAGE_WELCOME
!define MUI_LICENSEPAGE_TEXT_TOP "Citekeep is free software, provided as is, without warranty or support."
!define MUI_LICENSEPAGE_BUTTON "I Agree"
!insertmacro MUI_PAGE_LICENSE "LICENSE.txt"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"


; close a running Citekeep first, so its files can be replaced (it saves the library as it closes)
!macro CLOSE_CITEKEEP UN
Function ${UN}CloseCitekeep
  FindWindow $0 "" "Citekeep"
  ${If} $0 <> 0
    DetailPrint "Closing Citekeep…"
    SendMessage $0 ${WM_CLOSE} 0 0
    Sleep 3000
  ${EndIf}
  nsExec::Exec 'taskkill /IM Citekeep.exe'
  Pop $1
  Sleep 1500
  nsExec::Exec 'taskkill /F /IM Citekeep.exe'
  Pop $1
  Sleep 500
FunctionEnd
!macroend
!insertmacro CLOSE_CITEKEEP ""
!insertmacro CLOSE_CITEKEEP "un."

; don't replace a newer installed version with this older one without asking
Function .onInit
  ReadRegStr $0 HKCU "${UNINSTKEY}" "DisplayVersion"
  StrCmp $0 "" done
  IntOp $1 $0 + 0
  IntOp $2 ${VERSION} + 0
  ${If} $1 > $2
    MessageBox MB_YESNO|MB_ICONEXCLAMATION "A newer version of Citekeep (V$1) is already installed.$\r$\n$\r$\nReplace it with this older version (V$2)? Choose No unless you need to go back to V$2." IDYES done
    Abort
  ${EndIf}
  done:
FunctionEnd

Section "Citekeep (required)" SecMain
  SectionIn RO
  Call CloseCitekeep
  SetOutPath "$INSTDIR"
  File "Citekeep.exe"
  File "resources.neu"
  File "citekeep.ico"
  File "LICENSE.txt"
  File "THIRD-PARTY-NOTICES.txt"
  WriteUninstaller "$INSTDIR\Uninstall Citekeep.exe"
  CreateShortcut "$SMPROGRAMS\Citekeep.lnk" "$INSTDIR\Citekeep.exe" "" "$INSTDIR\citekeep.ico" 0
  WriteRegStr HKCU "Software\Citekeep" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "Citekeep"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "Marc Ross"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\citekeep.ico"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall Citekeep.exe"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "EstimatedSize" 4500
SectionEnd

Section "Desktop shortcut" SecDesk
  CreateShortcut "$DESKTOP\Citekeep.lnk" "$INSTDIR\Citekeep.exe" "" "$INSTDIR\citekeep.ico" 0
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain} "The Citekeep program and a Start menu shortcut."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesk} "A Citekeep shortcut on your desktop."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Section "Uninstall"
  Call un.CloseCitekeep
  Delete "$INSTDIR\Citekeep.exe"
  Delete "$INSTDIR\resources.neu"
  Delete "$INSTDIR\citekeep.ico"
  Delete "$INSTDIR\LICENSE.txt"
  Delete "$INSTDIR\THIRD-PARTY-NOTICES.txt"
  Delete "$INSTDIR\Uninstall Citekeep.exe"
  RMDir /r "$INSTDIR\.storage"
  RMDir /r "$INSTDIR\.tmp"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\Citekeep.lnk"
  Delete "$DESKTOP\Citekeep.lnk"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\Citekeep"
SectionEnd
