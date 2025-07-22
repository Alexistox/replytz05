@echo off
echo.
echo =====================================
echo   Dừng Bank Transaction UserBot
echo =====================================
echo.

REM Check if PID file exists
if not exist "bot.pid" (
    echo ❌ Không tìm thấy bot đang chạy
    echo 📝 Bot có thể đã dừng hoặc chưa khởi chạy
    pause
    exit /b 0
)

REM Read PID from file
set /p BOT_PID=<bot.pid

echo 🔍 Tìm thấy bot với PID: %BOT_PID%

REM Kill the process
taskkill /PID %BOT_PID% /F >nul 2>&1
if errorlevel 1 (
    echo ❌ Không thể dừng bot (có thể đã dừng)
) else (
    echo ✅ Đã dừng bot thành công
)

REM Clean up PID file
if exist "bot.pid" (
    del "bot.pid"
    echo 🧹 Đã xóa PID file
)

echo.
echo 👋 Hoàn tất
pause 