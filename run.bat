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

REM Check if node_modules exists
if not exist "node_modules" (
    echo 📦 Đang cài đặt dependencies...
    npm install
    if errorlevel 1 (
        echo ❌ Lỗi khi cài đặt dependencies!
        pause
        exit /b 1
    )
    echo.
)

REM Check config
findstr /C:"YOUR_API_ID" config.js >nul
if not errorlevel 1 (
    echo ⚠️  CẢNH BÁO: Chưa cấu hình đầy đủ!
    echo 🔧 Vui lòng mở file config.js và cập nhật:
    echo    - apiId và apiHash ^(từ https://my.telegram.org/apps^)
    echo    - phoneNumber ^(số điện thoại với mã quốc gia^)
    echo.
    echo Bạn có muốn tiếp tục không? (Y/N)
    set /p choice=
    if /i "%choice%" neq "Y" exit /b 0
    echo.
)

findstr /C:"YOUR_PHONE_NUMBER" config.js >nul
if not errorlevel 1 (
    echo ⚠️  CẢNH BÁO: Chưa cấu hình số điện thoại!
    echo 🔧 Vui lòng cập nhật phoneNumber trong config.js
    echo 📱 Ví dụ: phoneNumber: '+84901234567'
    echo.
    echo Bạn có muốn tiếp tục không? (Y/N)
    set /p choice=
    if /i "%choice%" neq "Y" exit /b 0
    echo.
)

echo 🚀 Khởi động UserBot...
echo 💬 Gửi /help để xem hướng dẫn
echo 📝 Nhấn Ctrl+C để dừng bot
echo.

REM Start the bot
node index.js

echo.
echo 👋 UserBot đã dừng hoạt động
pause 