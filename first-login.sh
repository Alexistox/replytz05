#!/bin/bash

# Telegram Userbot - First Login Setup (Linux)
# This script helps you login for the first time and saves session to config.js

echo "=============================================="
echo "🚀 Telegram Bank Transaction Bot - First Login"
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

echo "🔐 FIRST LOGIN PROCESS:"
echo "1. You will need to enter your phone number"
echo "2. Enter the OTP code sent to your Telegram"
echo "3. Enter your 2FA password if enabled"
echo "4. Session will be automatically saved to config.js"
echo ""
echo "⚠️  This is ONE-TIME setup only!"
echo "   After this, you can use run-24-7.sh for production"
echo ""
read -p "Press Enter to continue..."

echo ""
echo "🔄 Starting first login..."

# Run the bot for first login
node index.js

echo ""
echo "✅ First login completed!"
echo ""
echo "🎯 NEXT STEPS:"
echo "1. Your session has been saved to config.js"
echo "2. Use './run-24-7.sh' to run the bot 24/7"
echo "3. Use './stop.sh' to stop the bot"
echo ""
echo "📝 For production deployment, see:"
echo "   - server-setup.md"
echo "   - deploy-with-session.md"
echo ""
echo "🎉 Bot is ready for 24/7 operation!"

read -p "Press Enter to exit..." 