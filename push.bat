@echo off
echo.
echo =====================================
echo   Push to GitHub - Reply01
echo =====================================
echo.

REM Check if there are changes
git status --porcelain > nul
if errorlevel 1 (
    echo ❌ Không phải Git repository!
    pause
    exit /b 1
)

echo 🔍 Kiểm tra thay đổi...
git status

echo.
echo 📝 Nhập commit message (Enter để dùng default):
set /p COMMIT_MSG="Commit message: "

if "%COMMIT_MSG%"=="" (
    set COMMIT_MSG=Update code - %date% %time%
)

echo.
echo 📦 Đang add và commit...
git add .
git commit -m "%COMMIT_MSG%"

if errorlevel 1 (
    echo ❌ Lỗi khi commit!
    pause
    exit /b 1
)

echo.
echo 🚀 Đang push lên GitHub...
git push

if errorlevel 1 (
    echo ❌ Lỗi khi push!
    pause
    exit /b 1
) else (
    echo ✅ Push thành công!
    echo 🔗 Xem tại: https://github.com/Alexistox/reply01
)

echo.
pause 