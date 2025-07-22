#!/bin/bash

# Git Push Helper Script (Linux)
# Automatically commits and pushes changes to GitHub

echo "🚀 Git Push Helper"
echo "=================="

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed!"
    echo "Please install Git first:"
    echo "  Ubuntu/Debian: sudo apt update && sudo apt install git"
    echo "  CentOS/RHEL: sudo yum install git"
    exit 1
fi

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Not a Git repository!"
    echo "Please make sure you're in the project root directory."
    exit 1
fi

# Check git status
echo "📋 Checking git status..."
git status --porcelain > /dev/null
if [ $? -ne 0 ]; then
    echo "❌ Git status check failed!"
    exit 1
fi

# Check if there are changes to commit
if [ -z "$(git status --porcelain)" ]; then
    echo "✅ No changes to commit!"
    echo "Everything is up to date."
    exit 0
fi

echo ""
echo "📁 Files to be committed:"
git status --short

echo ""
read -p "📝 Enter commit message (or press Enter for auto message): " COMMIT_MSG

# Use auto message if empty
if [ -z "$COMMIT_MSG" ]; then
    COMMIT_MSG="Update bot configuration and scripts - $(date '+%Y-%m-%d %H:%M:%S')"
fi

echo ""
echo "🔄 Adding files..."
git add .

if [ $? -ne 0 ]; then
    echo "❌ Git add failed!"
    exit 1
fi

echo "💾 Committing changes..."
git commit -m "$COMMIT_MSG"

if [ $? -ne 0 ]; then
    echo "❌ Git commit failed!"
    exit 1
fi

echo "🚀 Pushing to GitHub..."
git push

if [ $? -ne 0 ]; then
    echo "❌ Git push failed!"
    echo ""
    echo "🔧 Possible solutions:"
    echo "1. Check your internet connection"
    echo "2. Verify GitHub credentials"
    echo "3. Make sure you have push access to the repository"
    echo "4. Try: git push --set-upstream origin main"
    exit 1
fi

echo ""
echo "✅ Successfully pushed to GitHub!"
echo ""
echo "🎯 Commit: $COMMIT_MSG"
echo "📅 Time: $(date)"

# Show the remote URL
REMOTE_URL=$(git remote get-url origin 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "🔗 Repository: $REMOTE_URL"
fi 