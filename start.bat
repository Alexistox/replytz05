@echo off
echo.
echo =====================================
echo   Bank Transaction UserBot
echo =====================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js chưa được cài đặt!
    echo 📥 Vui lòng tải và cài Node.js từ: https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js đã được cài đặt
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo 📦 Đang cài đặt dependencies...
    npm install
    if errorlevel 1 (
        echo ❌ Lỗi khi cài đặt dependencies!
        pause
        exit /b 1
    )
    echo ✅ Cài đặt dependencies thành công!
    echo.
)

REM Check config
findstr /C:"YOUR_API_ID" config.js >nul
if not errorlevel 1 (
    echo ⚠️  CẢNH BÁO: Chưa cấu hình API credentials!
    echo 🔧 Vui lòng mở file config.js và cập nhật api_id, api_hash
    echo 📖 Hướng dẫn: https://my.telegram.org/apps
    echo.
    echo Bạn có muốn tiếp tục không? (Y/N)
    set /p choice=
    if /i "%choice%" neq "Y" exit /b 0
    echo.
)

echo 🚀 Khởi động Bank Transaction UserBot...
echo 📝 Nhấn Ctrl+C để dừng bot
echo.

REM Start the bot
node index.js

echo.
echo 👋 Bot đã dừng hoạt động
pause 