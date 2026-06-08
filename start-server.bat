@echo off
echo Iniciando servidor local do RogueBall 3D Arena...
where py >nul 2>nul
if %errorlevel%==0 (
  py -m http.server 8080
) else (
  python -m http.server 8080
)
pause
