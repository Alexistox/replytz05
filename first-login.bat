@echo off
echo.
echo =====================================
echo   First Time Login - Setup Session
echo =====================================
echo.

REM Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js chưa được cài đặt!
    pause
    exit /b 1
)

REM Check config
findstr /C:"YOUR_API_ID" config.js >nul
if not errorlevel 1 (
    echo ❌ Vui lòng cấu hình config.js trước!
    echo 🔧 Sửa: apiId, apiHash, phoneNumber
    pause
    exit /b 1
)

echo ⚠️  LẦN ĐĂNG NHẬP ĐẦU TIÊN
echo.
echo 📱 Chuẩn bị điện thoại để nhận mã xác nhận
echo 🔐 Chuẩn bị mật khẩu 2FA (nếu có)
echo.
echo Sau khi đăng nhập thành công:
echo - Session sẽ được lưu tự động
echo - Lần sau không cần nhập OTP nữa
echo - Có thể chạy bot 24/7 với run-24-7.bat
echo.

set /p confirm="Bạn đã sẵn sàng? (Y/N): "
if /i "%confirm%" neq "Y" exit /b 0

echo.
echo 🚀 Bắt đầu đăng nhập...
echo ⏳ Chờ tin nhắn xác nhận từ Telegram...
echo.

REM Run bot for first login
npm start

echo.
echo ✅ Hoàn tất setup!
echo 🔄 Giờ bạn có thể chạy bot 24/7 với: run-24-7.bat
pause 