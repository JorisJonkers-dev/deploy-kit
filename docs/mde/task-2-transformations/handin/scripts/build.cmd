@echo off
rem Builds the implementation, runs every test, and copies the models of each example to output\.
setlocal
cd /d "%~dp0"
pushd implementation\emf
call mvnw.cmd -B clean verify
if errorlevel 1 (popd & exit /b 1)
popd
if exist output rmdir /s /q output
for %%e in (minimal auth data delivery edge knowledge-platform observability secrets) do (
  mkdir output\%%e
  copy /y implementation\emf\bundles\cli\target\parity\%%e\*.xmi output\%%e\ >nul
  copy /y implementation\emf\bundles\cli\target\parity\%%e\*.resolveddeployment output\%%e\ >nul
  copy /y implementation\emf\bundles\cli\target\parity\%%e\dependencies.json output\%%e\ >nul
)
echo Models written to output\^<example^>\
