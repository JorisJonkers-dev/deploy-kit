@echo off
rem Builds the implementation and runs its tests, then runs the model-to-text transformation on each
rem example's model and compares the generated files with the expected ones. build.cmd --mutation
rem also runs the mutation tests, which take much longer.
setlocal
cd /d "%~dp0"
set PIT=-DskipPitest=true
if "%~1"=="--mutation" set PIT=
pushd implementation\emf
call mvnw.cmd -B clean verify %PIT% dependency:copy-dependencies "-DoutputDirectory=%CD%\target\lib"
if errorlevel 1 (popd & exit /b 1)
popd
set JAVA=java
if defined JAVA_HOME set JAVA="%JAVA_HOME%\bin\java"
if exist output rmdir /s /q output
for %%e in (minimal:notes data:data edge:edge) do (
  for /f "tokens=1,2 delims=:" %%a in ("%%e") do (
    %JAVA% -cp "implementation\emf\target\lib\*" task-3-code-generation\scripts\Render.java task-3-code-generation\examples\%%a\%%b.resolveddeployment output\%%a task-3-code-generation\examples\%%a\expected
    if errorlevel 1 exit /b 1
  )
)
echo Generated files written to output\^<example^>\
