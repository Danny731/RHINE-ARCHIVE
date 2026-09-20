; Headless unit harness. Every shortcut is under the supplied test directory;
; no real installation, user desktop, start menu, or application registry is touched.
Unicode true
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
OutFile "${TEST_OUTPUT}"
!include MUI2.nsh
!include FileFunc.nsh
!include x64.nsh
!include "Win\COM.nsh"
!include "Win\Propkey.nsh"
!include "${TAURI_UTILS}"
!include "brand-migration.nsh"
!define MAINBINARYNAME "RHINE ARCHIVE"
!define BUNDLEID "com.rhinearchive.shortcut-test"

Section
  StrCpy $INSTDIR "${TEST_ROOT}"
  CreateDirectory "$INSTDIR\fresh"
  CreateDirectory "$INSTDIR\existing"
  CreateDirectory "$INSTDIR\unrelated"
  CreateDirectory "$INSTDIR\collision"

  CreateShortcut "$INSTDIR\fresh\Pagewise.lnk" "$INSTDIR\pagewise.exe"
  !insertmacro RHINE_MIGRATE_SHORTCUT "$INSTDIR\fresh\Pagewise.lnk" "$INSTDIR\fresh\RHINE ARCHIVE.lnk"

  CreateShortcut "$INSTDIR\existing\Pagewise.lnk" "$INSTDIR\pagewise.exe"
  CreateShortcut "$INSTDIR\existing\RHINE ARCHIVE.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  !insertmacro RHINE_MIGRATE_SHORTCUT "$INSTDIR\existing\Pagewise.lnk" "$INSTDIR\existing\RHINE ARCHIVE.lnk"

  CreateShortcut "$INSTDIR\unrelated\Pagewise.lnk" "$INSTDIR\unrelated.exe"
  !insertmacro RHINE_MIGRATE_SHORTCUT "$INSTDIR\unrelated\Pagewise.lnk" "$INSTDIR\unrelated\RHINE ARCHIVE.lnk"

  CreateShortcut "$INSTDIR\collision\Pagewise.lnk" "$INSTDIR\pagewise.exe"
  CreateShortcut "$INSTDIR\collision\RHINE ARCHIVE.lnk" "$INSTDIR\unrelated.exe"
  !insertmacro RHINE_MIGRATE_SHORTCUT "$INSTDIR\collision\Pagewise.lnk" "$INSTDIR\collision\RHINE ARCHIVE.lnk"
SectionEnd
