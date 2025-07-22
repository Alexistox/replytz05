#!/bin/bash

# 🖥️ Bank Transaction UserBot - Server Setup Script
# This script handles first-time login and PM2 deployment

set -e  # Exit on any error

echo "🖥️  Bank Transaction UserBot - Server Setup"
echo "=========================================="
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    print_error "Không nên chạy script này với quyền root!"
    echo "Tạo user thường và chạy lại:"
    echo "sudo adduser botuser && sudo usermod -aG sudo botuser"
    echo "su - botuser"
    exit 1
fi

# Check Node.js
print_info "Kiểm tra Node.js..."
if ! command -v node &> /dev/null; then
    print_error "Node.js chưa được cài đặt!"
    echo
    echo "Cài Node.js bằng lệnh sau:"
    echo "curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
    echo "sudo apt-get install -y nodejs"
    exit 1
else
    NODE_VERSION=$(node --version)
    print_status "Node.js version: $NODE_VERSION"
fi

# Check if bot directory exists
BOT_DIR="$HOME/reply01"
if [ -d "$BOT_DIR" ]; then
    print_warning "Thư mục $BOT_DIR đã tồn tại"
    read -p "Bạn có muốn xóa và tạo lại không? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$BOT_DIR"
        print_status "Đã xóa thư mục cũ"
    else
        print_info "Sử dụng thư mục hiện tại"
    fi
fi

# Clone repository if not exists
if [ ! -d "$BOT_DIR" ]; then
    print_info "Clone repository..."
    git clone https://github.com/Alexistox/reply01.git "$BOT_DIR"
    print_status "Clone thành công"
fi

# Navigate to bot directory
cd "$BOT_DIR"

# Install dependencies
print_info "Cài đặt dependencies..."
npm install
print_status "Dependencies đã được cài đặt"

# Setup config
if [ ! -f "config.js" ]; then
    print_info "Tạo file config..."
    cp config.example.js config.js
    print_warning "⚠️  QUAN TRỌNG: Bạn cần sửa file config.js trước khi tiếp tục!"
    echo
    echo "Mở file config.js và cập nhật:"
    echo "- apiId: API ID từ my.telegram.org/apps"
    echo "- apiHash: API Hash từ my.telegram.org/apps" 
    echo "- phoneNumber: Số điện thoại Telegram của bạn"
    echo
    read -p "Nhấn Enter sau khi đã sửa xong config.js..." -r
fi

# Verify config
if grep -q "YOUR_API_ID" config.js || grep -q "YOUR_PHONE_NUMBER" config.js; then
    print_error "Config.js chưa được cập nhật đầy đủ!"
    echo "Vui lòng sửa file config.js trước khi tiếp tục"
    echo "nano config.js"
    exit 1
fi

print_status "Config đã được cấu hình"

# Check if session exists
if ls *.session 2>/dev/null; then
    print_warning "Session file đã tồn tại, bot có thể đã được login"
    read -p "Bạn có muốn login lại không? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -f *.session*
        print_status "Đã xóa session cũ"
    else
        SKIP_LOGIN=true
    fi
fi

# First-time login
if [ "$SKIP_LOGIN" != "true" ]; then
    echo
    print_info "=== ĐĂNG NHẬP LẦN ĐẦU ==="
    print_warning "Bot sẽ yêu cầu mã xác nhận từ Telegram"
    print_warning "Hãy chuẩn bị điện thoại để nhận mã"
    echo
    read -p "Nhấn Enter khi sẵn sàng..." -r
    
    # Start bot for first login
    echo
    print_info "Khởi động bot để đăng nhập..."
    echo "Sau khi thấy '✅ UserBot đã sẵn sàng hoạt động!', nhấn Ctrl+C"
    echo
    
    # Set timeout for login process
    timeout 300 npm start || {
        if [ $? -eq 124 ]; then
            print_error "Login timeout sau 5 phút!"
            exit 1
        fi
    }
    
    # Check if session was created
    if ! ls *.session 2>/dev/null; then
        print_error "Login không thành công! Không tìm thấy session file"
        exit 1
    fi
    
    print_status "Login thành công! Session đã được tạo"
fi

# Install PM2 if not exists
if ! command -v pm2 &> /dev/null; then
    print_info "Cài đặt PM2..."
    sudo npm install -g pm2
    print_status "PM2 đã được cài đặt"
fi

# Create PM2 ecosystem config
print_info "Tạo PM2 ecosystem config..."
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'bank-transaction-bot',
    script: 'index.js',
    cwd: '$BOT_DIR',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    restart_delay: 5000,
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
EOF

# Create logs directory
mkdir -p logs
print_status "PM2 config đã được tạo"

# Stop any existing instance
pm2 stop bank-transaction-bot 2>/dev/null || true
pm2 delete bank-transaction-bot 2>/dev/null || true

# Start bot with PM2
print_info "Khởi động bot với PM2..."
pm2 start ecosystem.config.js

# Save PM2 config
pm2 save

# Setup PM2 startup
print_info "Cấu hình PM2 tự khởi động..."
pm2 startup | grep -E '^sudo' | sh

print_status "Bot đã được khởi động với PM2!"

echo
print_info "=== THÔNG TIN BOT ==="
echo "📂 Thư mục: $BOT_DIR"
echo "📊 Trạng thái: $(pm2 list | grep bank-transaction-bot)"
echo "📝 Logs: pm2 logs bank-transaction-bot"
echo "🔄 Restart: pm2 restart bank-transaction-bot"
echo "🛑 Stop: pm2 stop bank-transaction-bot"

echo
print_info "=== LỆNH HỮU ÍCH ==="
echo "• Xem logs: pm2 logs bank-transaction-bot --lines 50"
echo "• Monitor: pm2 monit"
echo "• Status: pm2 status"
echo "• Restart: pm2 restart bank-transaction-bot"

# Show logs
echo
print_info "Logs hiện tại (5 dòng cuối):"
pm2 logs bank-transaction-bot --lines 5 --nostream

echo
print_status "🎉 Setup hoàn tất! Bot đang chạy 24/7 với PM2"
print_info "Gửi /help trong Telegram để test bot" 