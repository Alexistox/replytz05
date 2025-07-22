#!/bin/bash

# Telegram Userbot - 24/7 Production Runner (Linux)
# Runs the bot using saved session (no OTP/2FA required)

echo "=============================================="
echo "🚀 Telegram Bank Transaction Bot - 24/7 Mode"
echo "=============================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "Please install Node.js first:"
    echo "  Ubuntu/Debian: sudo apt update && sudo apt install nodejs npm"
    echo "  CentOS/RHEL: sudo yum install nodejs npm"
    echo "  Or visit: https://nodejs.org/"
    exit 1
fi

# Check if config.js exists
if [ ! -f "config.js" ]; then
    echo "❌ config.js not found!"
    echo "Please make sure you're in the correct directory and config.js exists."
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies!"
        exit 1
    fi
fi

# Check if session exists in config.js
if ! grep -q "sessionString.*['\"][^'\"]*['\"]" config.js; then
    echo "⚠️  No session found in config.js!"
    echo ""
    echo "🔐 You need to login first:"
    echo "   Run: ./first-login.sh"
    echo ""
    echo "Or manually update sessionString in config.js"
    exit 1
fi

echo "✅ Config validated!"
echo "🔄 Starting bot in 24/7 mode..."
echo ""
echo "📝 Bot Features:"
echo "   • Auto-reply '1' to bank transaction messages"
echo "   • Commands: /1 on, /1 off, /help"
echo "   • No OTP/2FA required (using saved session)"
echo ""
echo "🛑 To stop the bot:"
echo "   • Press Ctrl+C in this terminal"
echo "   • Or run: ./stop.sh"
echo ""
echo "🔄 Starting..."

# Run the bot
node index.js 