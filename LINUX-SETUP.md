# 🐧 Telegram Bank Transaction Bot - Linux Setup Guide

Complete guide for running the bot on Linux servers (Ubuntu, CentOS, Debian, etc.)

---

## 🚀 Quick Setup (3 Steps)

### 1. **Install Requirements**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nodejs npm git

# CentOS/RHEL
sudo yum install nodejs npm git

# Verify installation
node --version
npm --version
git --version
```

### 2. **Download & Configure**
```bash
# Clone the repository
git clone https://github.com/Alexistox/reply01.git
cd reply01

# Install dependencies
npm install

# Copy and edit config
cp config.example.js config.js
nano config.js
```

### 3. **First Login & Run**
```bash
# Make scripts executable
chmod +x *.sh

# First-time login (enter OTP/2FA once)
./first-login.sh

# Run 24/7 (no OTP needed after first login)
./run-24-7.sh
```

**🎉 Done! Your bot is running 24/7!**

---

## 📋 Available Linux Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `./run.sh` | Quick start with checks | `./run.sh` |
| `./first-login.sh` | First-time setup (OTP) | `./first-login.sh` |
| `./run-24-7.sh` | Production 24/7 mode | `./run-24-7.sh` |
| `./stop.sh` | Stop the bot safely | `./stop.sh` |
| `./push.sh` | Push changes to GitHub | `./push.sh` |

### NPM Scripts (Alternative)
```bash
npm run linux:run           # ./run.sh
npm run linux:first-login   # ./first-login.sh  
npm run linux:run-24-7      # ./run-24-7.sh
npm run linux:stop          # ./stop.sh
npm run linux:push          # ./push.sh
```

---

## 🛠️ Configuration

### Edit `config.js`
```bash
nano config.js
```

**Required fields:**
```javascript
module.exports = {
    apiId: 'YOUR_API_ID',        // From my.telegram.org
    apiHash: 'YOUR_API_HASH',    // From my.telegram.org  
    phoneNumber: '+1234567890',   // Your phone with country code
    sessionString: '',           // Will be auto-filled after first login
    // ... other settings
};
```

---

## 🔄 Running Modes

### 🔧 Development Mode
**For testing and development:**
```bash
./run.sh
# or
npm start
```
- Interactive login each time
- Good for testing changes
- Shows all logs

### 🚀 Production Mode
**For 24/7 server deployment:**
```bash
# Step 1: First-time login (once only)
./first-login.sh

# Step 2: Run production (no OTP needed)
./run-24-7.sh
```
- Uses saved session
- No interactive input required
- Perfect for servers

---

## 🏗️ Server Deployment

### 🐳 Option 1: Docker (Recommended)
```bash
# Create Dockerfile
cat > Dockerfile << 'EOF'
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN chmod +x *.sh
CMD ["./run-24-7.sh"]
EOF

# Build and run
docker build -t telegram-bot .
docker run -d --name telegram-bot telegram-bot
```

### ⚡ Option 2: PM2 Process Manager
```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start ecosystem.config.js

# Monitor
pm2 status
pm2 logs telegram-bot

# Auto-start on server boot
pm2 startup
pm2 save
```

### 🔧 Option 3: systemd Service
```bash
# Create service file
sudo tee /etc/systemd/system/telegram-bot.service << 'EOF'
[Unit]
Description=Telegram Bank Transaction Bot
After=network.target

[Service]
Type=simple
User=your_user
WorkingDirectory=/path/to/reply01
ExecStart=/path/to/reply01/run-24-7.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable telegram-bot
sudo systemctl start telegram-bot

# Check status
sudo systemctl status telegram-bot
```

---

## 🛡️ Security & Best Practices

### 🔐 File Permissions
```bash
# Secure config and session files
chmod 600 config.js
chmod 600 *.session

# Make scripts executable
chmod +x *.sh

# Secure project directory
chmod 755 .
```

### 🚪 Firewall (if needed)
```bash
# Ubuntu/Debian
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow out 443
sudo ufw allow out 80

# CentOS/RHEL
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 🔄 Auto-Updates
```bash
# Create update script
cat > update.sh << 'EOF'
#!/bin/bash
./stop.sh
git pull
npm install
./run-24-7.sh
EOF

chmod +x update.sh

# Add to cron for daily updates (optional)
crontab -e
# Add: 0 2 * * * /path/to/reply01/update.sh
```

---

## 📊 Monitoring & Maintenance

### 📋 Check Bot Status
```bash
# Check if running
ps aux | grep "node.*index.js"

# Check PID file
cat bot.pid 2>/dev/null || echo "Not running"

# Check logs (if using PM2)
pm2 logs telegram-bot

# Check system logs
journalctl -u telegram-bot -f
```

### 🔧 Common Maintenance Tasks
```bash
# Restart bot
./stop.sh && ./run-24-7.sh

# Update code
git pull && npm install

# Check disk space
df -h

# Check memory usage
free -h

# Check bot process
top -p $(cat bot.pid 2>/dev/null)
```

---

## 🆘 Troubleshooting

### ❌ "Permission denied" errors
```bash
chmod +x *.sh
```

### ❌ "Command not found: node"
```bash
# Check Node.js installation
which node
node --version

# Install Node.js if missing
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### ❌ "Cannot find module" errors
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### ❌ Session expired errors
```bash
# Re-login (will save new session)
./first-login.sh
```

### ❌ Bot not responding to commands
```bash
# Check if bot is actually running
ps aux | grep index.js

# Check logs
tail -f bot.log

# Restart bot
./stop.sh
./run-24-7.sh
```

---

## 📚 Advanced Configuration

### 🎯 Custom Message Patterns
Edit `utils.js` to modify the transaction message pattern:
```javascript
function isTransactionMessage(text) {
    // Modify this regex to match your bank's format
    const patterns = [
        /Tiền vào:\s*\+[\d,]+\s*đ/i,
        // Add more patterns here
    ];
    // ...
}
```

### 📱 Multiple Accounts
Create separate directories for each account:
```bash
mkdir bot1 bot2 bot3
cd bot1 && git clone ... && ./first-login.sh
cd ../bot2 && git clone ... && ./first-login.sh
```

### 🔔 Custom Notifications
Add webhook notifications to `index.js`:
```javascript
// After successful reply
const webhook = 'https://hooks.slack.com/...';
// Send notification
```

---

## 📞 Support

- **GitHub Issues**: [Report bugs](https://github.com/Alexistox/reply01/issues)
- **Documentation**: Check README.md for more details
- **Server Setup**: See server-setup.md for advanced deployment

---

## ✅ Quick Checklist

- [ ] Node.js 16+ installed
- [ ] Git installed  
- [ ] Repository cloned
- [ ] Dependencies installed (`npm install`)
- [ ] Config file created and edited (`config.js`)
- [ ] Scripts made executable (`chmod +x *.sh`)
- [ ] First login completed (`./first-login.sh`)
- [ ] Bot running 24/7 (`./run-24-7.sh`)
- [ ] Monitoring setup (PM2/systemd)

**🎉 Congratulations! Your bot is ready for production!** 