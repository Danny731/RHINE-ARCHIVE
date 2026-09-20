; Hooks are included before the template's defines, so all references are in macros.
; Only shortcuts that still target this installation's old executable are migrated.
!macro RHINE_MIGRATE_SHORTCUT oldLink newLink
  !insertmacro IsShortcutTarget "${oldLink}" "$INSTDIR\pagewise.exe"
  Pop $R4
  ${If} $R4 = 1
    ${If} ${FileExists} "${newLink}"
      !insertmacro IsShortcutTarget "${newLink}" "$INSTDIR\${MAINBINARYNAME}.exe"
      Pop $R4
    ${Else}
      ClearErrors
      CreateShortcut "${newLink}" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
      ${If} ${Errors}
        StrCpy $R4 0
      ${Else}
        !insertmacro SetLnkAppUserModelId "${newLink}"
        StrCpy $R4 1
      ${EndIf}
    ${EndIf}
    ${If} $R4 = 1
      !insertmacro UnpinShortcut "${oldLink}"
      Delete "${oldLink}"
    ${Else}
      ; Keep a working old shortcut if the new name is occupied by an unrelated link.
      !insertmacro SetShortcutTarget "${oldLink}" "$INSTDIR\${MAINBINARYNAME}.exe"
      DetailPrint "Shortcut rename was skipped because its destination is unavailable: ${newLink}"
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; Do not terminate a reader with potentially unsaved work during a rename.
  nsis_tauri_utils::FindProcessCurrentUser "pagewise.exe"
  Pop $R0
  ${If} $R0 = 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "请先正常退出正在运行的阅读器，再安装 RHINE ARCHIVE。" /SD IDOK
    Abort
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Also runs for /UPDATE, which intentionally skips normal shortcut creation.
  !insertmacro RHINE_MIGRATE_SHORTCUT "$SMPROGRAMS\Pagewise.lnk" "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  !insertmacro RHINE_MIGRATE_SHORTCUT "$DESKTOP\Pagewise.lnk" "$DESKTOP\${PRODUCTNAME}.lnk"
!macroend
