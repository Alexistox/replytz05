#!/bin/bash

# Telegram Userbot - Quick Start Script (Linux)
# Checks configuration and starts the bot

echo "=============================================="
echo "🤖 Telegram Bank Transaction Bot - Quick Start"
echo "=============================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo ""
    echo "📦 Install Node.js:"
    echo "  Ubuntu/Debian:"
    echo "    sudo apt update"
    echo "    sudo apt install nodejs npm"
    echo ""
    echo "  CentOS/RHEL:"
    echo "    sudo yum install nodejs npm"
    echo ""
    echo "  Or visit: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js: $(node --version)"

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed!"
    echo "Please install npm along with Node.js"
    exit 1
fi

echo "✅ npm: $(npm --version)"

# Check if config.js exists
if [ ! -f "config.js" ]; then
    echo "❌ config.js not found!"
    echo ""
    echo "📝 Please create config.js from config.example.js:"
    echo "   cp config.example.js config.js"
    echo ""
    echo "Then edit config.js with your credentials:"
    echo "   nano config.js"
    exit 1
fi

echo "✅ Configuration file found"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo ""
    echo "📦 Installing dependencies..."
    npm install
    
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies!"
        echo ""
        echo "🔧 Try:"
        echo "   npm cache clean --force"
        echo "   npm install"
        exit 1
    fi
    
    echo "✅ Dependencies installed successfully!"
fi

echo "✅ Dependencies ready"

# Check basic config validation
if ! node -e "require('./config.js')" 2>/dev/null; then
    echo "❌ config.js has syntax errors!"
    echo ""
    echo "🔧 Please fix config.js syntax"
    echo "   Check for missing quotes, commas, etc."
    exit 1
fi

echo "✅ Configuration syntax valid"

echo ""
echo "🚀 Starting bot..."
echo ""
echo "📝 Bot Features:"
echo "   • Auto-reply '1' to bank transaction messages"
echo "   • Commands: /1 on, /1 off, /help"
echo ""
echo "🛑 To stop: Press Ctrl+C"
echo "          Or run: ./stop.sh"
echo ""
echo "🔄 Connecting to Telegram..."

# Start the bot
node index.js 