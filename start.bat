@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

rem 对话式博客 · 启动脚本
rem   start.bat        正式启动：构建前端 + 启动服务（一个进程）
rem   start.bat dev    开发模式：后端 8787 + 前端 5173（热更新）
rem   设 NO_BROWSER=1  可禁止自动打开浏览器

if /i "%~1"=="dev" goto DEV

call :CHECK_NODE
if errorlevel 1 goto FAIL
call :PREPARE_ENV
call :PREPARE_DEPS
call :BUILD_IF_STALE
call :SHOW_INFO

if not "%NO_BROWSER%"=="1" start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process '%SCHEME%://localhost:%PORT%/'"

node server\index.js

echo.
echo   服务已停止。
pause
endlocal
exit /b 0

rem ==================== 开发模式 ====================
:DEV
call :CHECK_NODE
if errorlevel 1 goto FAIL
call :PREPARE_ENV
call :PREPARE_DEPS
call :READ_PORT

echo.
echo   开发模式
echo   --------------------------------------------------
echo   前端    http://localhost:5173   改代码即时生效，访问这个
echo   后端    http://localhost:%PORT%
echo   停止    关闭弹出的两个窗口
echo   --------------------------------------------------
echo.

start "chat-blog 后端" cmd /k "node server\index.js"
start "chat-blog 前端" cmd /k "npm --prefix web run dev"

if not "%NO_BROWSER%"=="1" start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 4; Start-Process 'http://localhost:5173/'"

powershell -NoProfile -Command "Start-Sleep -Seconds 3"
endlocal
exit /b 0

rem ==================== 子过程 ====================

:CHECK_NODE
where node >nul 2>nul
if not errorlevel 1 exit /b 0
echo.
echo   [错误] 没有找到 Node.js。请先安装 Node.js 20 或更高版本：https://nodejs.org/
echo.
exit /b 1

:PREPARE_ENV
if exist ".env" exit /b 0
if not exist ".env.example" exit /b 0
copy ".env.example" ".env" >nul
echo   [提示] 已根据模板生成 .env；首次启动会自动生成后台密码并打印在下面。
exit /b 0

:PREPARE_DEPS
if not exist "server\node_modules" (
  echo   [依赖] 正在安装后端依赖...
  pushd server
  call npm install
  popd
)
if not exist "web\node_modules" (
  echo   [依赖] 正在安装前端依赖...
  pushd web
  call npm install
  popd
)
exit /b 0

rem 源码比产物新就重新构建，避免看到旧页面
:BUILD_IF_STALE
if not exist "web\dist\index.html" goto DO_BUILD
powershell -NoProfile -Command "$s=(Get-ChildItem 'web\src' -Recurse -File|Sort-Object LastWriteTime -Descending|Select-Object -First 1).LastWriteTime; $c=(Get-Item 'web\index.html','web\vite.config.ts','web\package.json'|Sort-Object LastWriteTime -Descending|Select-Object -First 1).LastWriteTime; $n=if($s -gt $c){$s}else{$c}; if($n -gt (Get-Item 'web\dist\index.html').LastWriteTime){exit 1}else{exit 0}"
if errorlevel 1 goto DO_BUILD
exit /b 0
:DO_BUILD
echo   [构建] 前端产物不是最新，正在构建...
pushd web
call npm run build
popd
exit /b 0

rem 端口以 .env 为准，读不到就用 8787
:READ_PORT
set PORT=8787
for /f "tokens=2 delims==" %%p in ('findstr /b /i "PORT=" ".env" 2^>nul') do set PORT=%%p
exit /b 0

:SHOW_INFO
call :READ_PORT
set SCHEME=http
if exist "data\certs\fullchain.pem" if exist "data\certs\privkey.pem" set SCHEME=https
echo.
echo   对话式博客 · 正式模式
echo   --------------------------------------------------
echo   密码    在 .env 的 ADMIN_PASSWORD；忘了可在后台登录页点「修改密码」
echo   停止    关闭本窗口，或按 Ctrl+C
if "%SCHEME%"=="https" echo   提醒    证书签给域名；本地用 localhost 会提示不安全，点「继续」即可
echo   --------------------------------------------------
echo.
exit /b 0

:FAIL
pause
endlocal
exit /b 1
