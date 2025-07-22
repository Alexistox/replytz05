#!/bin/bash

# Telegram Userbot - Stop Script (Linux)
# Safely stops the bot using PID file

echo "🛑 Stopping Telegram Bank Transaction Bot..."

# Check if bot.pid exists
if [ ! -f "bot.pid" ]; then
    echo "❌ bot.pid file not found!"
    echo "   Bot may not be running or already stopped."
    
    # Try to find and kill any running node processes with our script
    echo "🔍 Searching for running bot processes..."
    PIDS=$(pgrep -f "node.*index.js")
    
    if [ -n "$PIDS" ]; then
        echo "📋 Found running processes: $PIDS"
        echo "💀 Killing processes..."
        echo "$PIDS" | xargs kill -TERM 2>/dev/null
        sleep 2
        
        # Check if still running and force kill
        PIDS=$(pgrep -f "node.*index.js")
        if [ -n "$PIDS" ]; then
            echo "⚠️  Force killing stubborn processes..."
            echo "$PIDS" | xargs kill -KILL 2>/dev/null
        fi
        
        echo "✅ Bot processes terminated!"
    else
        echo "ℹ️  No running bot processes found."
    fi
    
    exit 0
fi

# Read PID from file
PID=$(cat bot.pid)

echo "📋 Found PID: $PID"

# Check if process exists
if ! kill -0 $PID 2>/dev/null; then
    echo "❌ Process $PID is not running!"
    echo "🧹 Cleaning up bot.pid file..."
    rm -f bot.pid
    echo "✅ Cleanup completed!"
    exit 0
fi

# Try graceful shutdown first
echo "🔄 Sending SIGTERM to process $PID..."
kill -TERM $PID 2>/dev/null

# Wait a few seconds for graceful shutdown
sleep 3

# Check if still running
if kill -0 $PID 2>/dev/null; then
    echo "⚠️  Process still running, force killing..."
    kill -KILL $PID 2>/dev/null
    sleep 1
fi

# Verify it's stopped
if kill -0 $PID 2>/dev/null; then
    echo "❌ Failed to stop process $PID"
    exit 1
else
    echo "✅ Bot stopped successfully!"
    
    # Clean up PID file
    if [ -f "bot.pid" ]; then
        rm -f bot.pid
        echo "🧹 Cleaned up bot.pid file"
    fi
fi

echo ""
echo "🎯 Bot has been stopped."
echo "   To start again: ./run-24-7.sh" 