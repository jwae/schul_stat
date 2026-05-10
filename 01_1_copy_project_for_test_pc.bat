@echo off
setlocal

rem Quelle: aktueller Projektordner
set "SRC=%~dp0"

rem Zielordner anpassen
set "DST=Transfer"

echo.
echo Kopiere Projekt von:
echo   %SRC%
echo nach:
echo   %DST%
echo.

if not exist "%DST%" mkdir "%DST%"
if not exist "%DST%\frontend" mkdir "%DST%\frontend"
if not exist "%DST%\backend" mkdir "%DST%\backend"

echo [1/2] Kopiere Frontend...
robocopy "%SRC%frontend" "%DST%\frontend" /E /R:2 /W:2 ^
  /XD "%SRC%frontend\node_modules" "%SRC%frontend\dist" ^
  /XF "*.log" ".env.local"
set "RC1=%ERRORLEVEL%"

echo.
echo [2/2] Kopiere Backend...
robocopy "%SRC%backend" "%DST%\backend" /E /R:2 /W:2 ^
  /XD "%SRC%backend\node_modules" ^
  /XF "*.log" ".env"
set "RC2=%ERRORLEVEL%"

echo.
echo Frontend Exit-Code: %RC1%
echo Backend Exit-Code: %RC2%
echo.
echo Hinweis:
echo - Zielordner bei Bedarf oben in der Batch-Datei anpassen.
echo - Auf dem Ziel-PC danach in backend und frontend jeweils npm install ausfuehren.
echo.

pause
