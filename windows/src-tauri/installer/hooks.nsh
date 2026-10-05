; Brink NSIS hooks (plan 3.l): "Send to Brink" Explorer verb for .txt/.md/.url and the brink:// protocol.
; Everything lives under HKCU, so no admin rights are needed.

!macro BrinkWriteShare EXT
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\SendToBrink" "" "Send to Brink"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\SendToBrink" "Icon" "$INSTDIR\Brink.exe"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\SendToBrink\command" "" '"$INSTDIR\Brink.exe" --share "%1"'
!macroend

!macro BrinkDeleteShare EXT
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\SendToBrink"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro BrinkWriteShare ".txt"
  !insertmacro BrinkWriteShare ".md"
  !insertmacro BrinkWriteShare ".url"
  WriteRegStr HKCU "Software\Classes\brink" "" "URL:Brink"
  WriteRegStr HKCU "Software\Classes\brink" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\brink\DefaultIcon" "" "$INSTDIR\Brink.exe,0"
  WriteRegStr HKCU "Software\Classes\brink\shell\open\command" "" '"$INSTDIR\Brink.exe" "%1"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro BrinkDeleteShare ".txt"
  !insertmacro BrinkDeleteShare ".md"
  !insertmacro BrinkDeleteShare ".url"
  DeleteRegKey HKCU "Software\Classes\brink"
!macroend
