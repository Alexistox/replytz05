@echo off
echo.
echo =====================================
echo   Bank Transaction UserBot - 24/7
echo =====================================
echo.

REM Check if session exists
findstr /C:"sessionString: ''" config.js >nul
if not errorlevel 1 (
    echo ❌ Session chưa được lưu!
    echo 🔧 Chạy first-login.bat trước để đăng nhập lần đầu
    echo.
    pause
    exit /b 1
)

REM Check if bot is already running
if exist "bot.pid" (
    set /p EXISTING_PID=<bot.pid
    echo ⚠️  Bot có thể đang chạy với PID: !EXISTING_PID!
    
    tasklist /PID !EXISTING_PID! >nul 2>&1
    if not errorlevel 1 (
        echo ✅ Bot đã chạy rồi! 
        echo 📊 PID: !EXISTING_PID!
        echo 📝 Dùng stop.bat để dừng bot
        pause
        exit /b 0
    ) else (
        echo 🧹 PID file cũ, sẽ xóa và khởi động lại
        del bot.pid
    )
)

echo ✅ Session đã có sẵn - không cần OTP/2FA
echo 🚀 Khởi động bot 24/7...
echo 📝 Nhấn Ctrl+C để dừng bot
echo 📊 Dùng stop.bat để dừng an toàn
echo.
echo === BOT LOGS ===

REM Start bot
node index.js

REM Cleanup if stopped
if exist "bot.pid" del bot.pid

echo.
echo 👋 Bot đã dừng hoạt động
pause 