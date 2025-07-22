const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const readline = require('readline');

const config = require('./config');
const Utils = require('./utils');

class BankTransactionUserbot {
  constructor() {
    this.client = null;
    this.settings = Utils.loadSettings();
    this.isRunning = false;
    this.processedMessages = new Map(); // Store timestamp with message
    this.processingMessages = new Set(); // Track currently processing messages
    this.eventHandlerRegistered = false; // Prevent duplicate event handlers
    
    Utils.log('🤖 Bank Transaction Userbot khởi tạo');
    Utils.log(`📊 Trạng thái reply: ${this.settings.replyEnabled ? 'BẬT' : 'TẮT'}`);
  }

  // Khởi tạo client Telegram
  async initializeClient() {
    try {
      // Kiểm tra API credentials
      if (config.apiId === 'YOUR_API_ID' || config.apiHash === 'YOUR_API_HASH') {
        throw new Error('Vui lòng cập nhật API credentials trong config.js');
      }

      // Kiểm tra số điện thoại
      if (config.phoneNumber === 'YOUR_PHONE_NUMBER') {
        throw new Error('Vui lòng cập nhật số điện thoại trong config.js');
      }

      const stringSession = new StringSession(config.sessionString);
      
      this.client = new TelegramClient(stringSession, parseInt(config.apiId), config.apiHash, {
        connectionRetries: 5,
      });

      Utils.log('🔗 Đang kết nối tới Telegram...');
      
      // Check if session exists
      const hasValidSession = config.sessionString && config.sessionString.length > 10;
      if (hasValidSession) {
        Utils.log('🔑 Sử dụng session có sẵn - không cần OTP/2FA');
      } else {
        Utils.log('🆕 Lần đăng nhập đầu tiên - cần nhập mã xác nhận');
      }
      
      await this.client.start({
        phoneNumber: async () => {
          // Sử dụng số từ config, hoặc hỏi nếu không có
          if (config.phoneNumber && config.phoneNumber !== 'YOUR_PHONE_NUMBER') {
            Utils.log(`📱 Sử dụng số điện thoại từ config: ${config.phoneNumber}`);
            return config.phoneNumber;
          } else {
            return await this.askInput('Nhập số điện thoại (với mã quốc gia): ');
          }
        },
        password: async () => {
          if (hasValidSession) {
            Utils.log('🔐 Sử dụng 2FA từ session...');
          }
          return await this.askInput('Nhập mật khẩu 2FA (nếu có): ');
        },
        phoneCode: async () => {
          if (hasValidSession) {
            Utils.log('⚠️  Session có thể đã expired, cần mã xác nhận mới');
          }
          return await this.askInput('Nhập mã xác nhận: ');
        },
        onError: (err) => {
          Utils.log(`❌ Lỗi đăng nhập: ${err.message}`);
          throw err;
        },
      });

      // Save session string để lần sau không cần đăng nhập lại
      const currentSession = this.client.session.save();
      if (currentSession !== config.sessionString) {
        Utils.log('💾 Session string đã được cập nhật - đang lưu...');
        await this.saveSessionToConfig(currentSession);
        Utils.log('✅ Session đã được lưu vào config.js');
      }

      Utils.log('✅ Kết nối thành công!');
      return true;

    } catch (error) {
      Utils.log(`❌ Lỗi khởi tạo client: ${error.message}`);
      return false;
    }
  }

  // Helper để nhập input từ console
  askInput(question) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  // Save session string vào config.js
  async saveSessionToConfig(sessionString) {
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Đọc file config hiện tại
      const configPath = path.join(__dirname, 'config.js');
      let configContent = fs.readFileSync(configPath, 'utf8');
      
      // Replace sessionString
      const regex = /sessionString:\s*['"`][^'"`]*['"`]/;
      const newSessionLine = `sessionString: '${sessionString}'`;
      
      if (regex.test(configContent)) {
        configContent = configContent.replace(regex, newSessionLine);
      } else {
        // Nếu không tìm thấy, thêm vào
        configContent = configContent.replace(
          /(apiHash:\s*['"`][^'"`]*['"`],?\s*)/,
          `$1\n  \n  sessionString: '${sessionString}',`
        );
      }
      
      // Ghi lại file
      fs.writeFileSync(configPath, configContent, 'utf8');
      
      // Update config trong memory
      config.sessionString = sessionString;
      
      return true;
    } catch (error) {
      Utils.log(`❌ Lỗi khi lưu session: ${error.message}`);
      return false;
    }
  }

  // Đăng ký event handlers
  setupEventHandlers() {
    // Đảm bảo không đăng ký handler nhiều lần
    if (this.eventHandlerRegistered) {
      Utils.log('📱 Event handlers đã được đăng ký trước đó');
      return;
    }

    // Lắng nghe tin nhắn mới
    this.client.addEventHandler(async (event) => {
      try {
        await this.handleNewMessage(event);
      } catch (error) {
        Utils.log(`❌ Lỗi xử lý tin nhắn: ${error.message}`);
      }
    }, new NewMessage({}));

    this.eventHandlerRegistered = true;
    Utils.log('📱 Đã đăng ký event handlers');
  }

  // Xử lý tin nhắn mới
  async handleNewMessage(event) {
    const message = event.message;
    if (!message) return;

    const messageText = message.message || message.text || '';
    const chatId = message.chatId;
    const messageId = message.id;
    const currentTime = Date.now();

    // Tạo unique key để track message
    const messageKey = `${chatId}_${messageId}`;
    
    // Skip nếu đã xử lý message này rồi (trong 30 giây qua)
    if (this.processedMessages.has(messageKey)) {
      const processedTime = this.processedMessages.get(messageKey);
      if (currentTime - processedTime < 30000) { // 30 seconds
        Utils.log(`🔄 Skip duplicate message: ${messageKey}`);
        return;
      }
    }

    // Skip nếu đang process message này
    if (this.processingMessages.has(messageKey)) {
      Utils.log(`⏳ Message đang được xử lý: ${messageKey}`);
      return;
    }

    // Mark as processing
    this.processingMessages.add(messageKey);

    try {
      // Kiểm tra commands trước (cho phép chính mình sử dụng commands)
      if (messageText.startsWith('/')) {
        // Mark as processed cho commands
        this.processedMessages.set(messageKey, currentTime);
        await this.handleCommand(messageText, chatId, messageId);
        return;
      }

      // Kiểm tra nếu chức năng reply đã bật
      if (!this.settings.replyEnabled) return;

      // Kiểm tra xem có phải tin nhắn giao dịch không
      if (Utils.isTransactionMessage(messageText)) {
        // Mark as processed trước khi xử lý
        this.processedMessages.set(messageKey, currentTime);
        
        // Cho phép reply cả tin nhắn từ chính mình nếu là tin nhắn giao dịch
        await this.handleTransactionMessage(message, messageText);
      }
      // Skip các tin nhắn khác từ chính mình (outgoing)
      else if (message.out) {
        return;
      }

    } finally {
      // Remove from processing set
      this.processingMessages.delete(messageKey);
    }

    // Cleanup old processed messages (giữ 1000 messages gần nhất)
    if (this.processedMessages.size > 1000) {
      const oldEntries = Array.from(this.processedMessages.entries()).slice(0, 500);
      oldEntries.forEach(([key]) => this.processedMessages.delete(key));
    }
  }

  // Xử lý tin nhắn giao dịch
  async handleTransactionMessage(message, messageText) {
    try {
      const messageKey = `${message.chatId}_${message.id}`;
      
      Utils.log(`🔥 Bắt đầu xử lý giao dịch: ${messageKey}`);
      
      const amount = Utils.formatAmount(messageText);
      const accountInfo = Utils.extractAccountInfo(messageText);
      
      // Check if message is from self
      const fromSelf = message.out ? " (từ chính mình)" : "";
      
      Utils.log(`💰 Phát hiện giao dịch${fromSelf}: +${amount}đ từ ${accountInfo.bank} - ${accountInfo.account}`);
      
      // Double-check để tránh reply duplicate
      const replyKey = `reply_${messageKey}`;
      if (this.processedMessages.has(replyKey)) {
        Utils.log(`🚫 Đã reply message này rồi: ${messageKey}`);
        return;
      }
      
      // Mark reply as processed
      this.processedMessages.set(replyKey, Date.now());
      
      // Reply với số "1"
      await this.client.sendMessage(message.chatId, {
        message: this.settings.replyMessage,
        replyTo: message.id
      });

      Utils.log(`✅ Đã reply tin nhắn giao dịch với: "${this.settings.replyMessage}" cho ${messageKey}`);

    } catch (error) {
      Utils.log(`❌ Lỗi khi reply tin nhắn giao dịch: ${error.message}`);
    }
  }

  // Xử lý commands
  async handleCommand(messageText, chatId, messageId) {
    const commandData = Utils.parseCommand(messageText);
    if (!commandData) return;

    const { command, args } = commandData;

    switch (command) {
      case '/1':
        await this.handleReplyCommand(args, chatId, messageId);
        break;
      
      case '/status':
        await this.handleStatusCommand(chatId, messageId);
        break;
      
      case '/help':
        await this.handleHelpCommand(chatId, messageId);
        break;
    }
  }

  // Xử lý command /1 on/off
  async handleReplyCommand(args, chatId, messageId) {
    if (args.length === 0) {
      const status = this.settings.replyEnabled ? 'BẬT' : 'TẮT';
      await this.sendReply(chatId, messageId, `⚙️ Trạng thái hiện tại: ${status}\nDùng /1 on để bật, /1 off để tắt`);
      return;
    }

    const action = args[0].toLowerCase();
    
    if (action === 'on') {
      this.settings.replyEnabled = true;
      Utils.saveSettings(this.settings);
      Utils.log('🟢 Chức năng reply đã BẬT');
      await this.sendReply(chatId, messageId, '✅ Đã BẬT chức năng reply giao dịch');
      
    } else if (action === 'off') {
      this.settings.replyEnabled = false;
      Utils.saveSettings(this.settings);
      Utils.log('🔴 Chức năng reply đã TẮT');
      await this.sendReply(chatId, messageId, '❌ Đã TẮT chức năng reply giao dịch');
      
    } else {
      await this.sendReply(chatId, messageId, '❗ Sử dụng: /1 on hoặc /1 off');
    }
  }

  // Xử lý command /status
  async handleStatusCommand(chatId, messageId) {
    const status = this.settings.replyEnabled ? '🟢 BẬT' : '🔴 TẮT';
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    
    const statusMessage = `
📊 **Trạng thái UserBot**

🤖 Bot: Đang hoạt động
⚙️ Reply giao dịch: ${status}
💬 Tin nhắn reply: "${this.settings.replyMessage}"
⏱️ Uptime: ${hours}h ${minutes}m

📝 Commands:
/1 on - Bật reply
/1 off - Tắt reply
/status - Xem trạng thái
/help - Hướng dẫn
    `.trim();

    await this.sendReply(chatId, messageId, statusMessage);
  }

  // Xử lý command /help
  async handleHelpCommand(chatId, messageId) {
    const helpMessage = `
🤖 **Bank Transaction UserBot**

**Chức năng:**
Bot sẽ tự động phát hiện tin nhắn giao dịch ngân hàng và reply bằng số "1"

**Định dạng tin nhắn được phát hiện:**
- Tiền vào: +2,000 đ
- Tài khoản: 20918031 tại ACB  
- Lúc: 2025-07-20 11:10:22
- Nội dung CK: ...

**Commands:**
/1 on - Bật chức năng reply
/1 off - Tắt chức năng reply
/1 - Xem trạng thái hiện tại
/status - Xem thông tin chi tiết
/help - Hiển thị hướng dẫn này

⚠️ **Lưu ý:** Bot chỉ reply tin nhắn có đầy đủ thông tin giao dịch
    `.trim();

    await this.sendReply(chatId, messageId, helpMessage);
  }

  // Helper để send reply
  async sendReply(chatId, messageId, text) {
    try {
      await this.client.sendMessage(chatId, {
        message: text,
        replyTo: messageId
      });
    } catch (error) {
      Utils.log(`❌ Lỗi khi send reply: ${error.message}`);
    }
  }

  // Kiểm tra instance khác
  checkSingleInstance() {
    const fs = require('fs');
    const pidFile = './bot.pid';
    
    try {
      if (fs.existsSync(pidFile)) {
        const oldPid = fs.readFileSync(pidFile, 'utf8').trim();
        
        // Kiểm tra nếu process cũ vẫn đang chạy
        try {
          process.kill(oldPid, 0); // Check if process exists
          Utils.log(`⚠️  Phát hiện bot khác đang chạy (PID: ${oldPid})`);
          Utils.log('🛑 Vui lòng dừng bot cũ trước khi chạy bot mới');
          process.exit(1);
        } catch (e) {
          // Process không tồn tại, có thể xóa file cũ
          Utils.log('🧹 Dọn dệp PID file cũ');
          fs.unlinkSync(pidFile);
        }
      }
      
      // Tạo PID file mới
      fs.writeFileSync(pidFile, process.pid.toString());
      Utils.log(`📝 Tạo PID file: ${process.pid}`);
      
    } catch (error) {
      Utils.log(`❌ Lỗi kiểm tra instance: ${error.message}`);
    }
  }

  // Cleanup khi thoát
  cleanup() {
    const fs = require('fs');
    const pidFile = './bot.pid';
    
    try {
      if (fs.existsSync(pidFile)) {
        fs.unlinkSync(pidFile);
        Utils.log('🧹 Đã xóa PID file');
      }
    } catch (error) {
      Utils.log(`❌ Lỗi cleanup: ${error.message}`);
    }
  }

  // Khởi chạy bot
  async start() {
    try {
      Utils.log('🚀 Khởi động Bank Transaction UserBot...');
      
      // Kiểm tra single instance
      this.checkSingleInstance();
      
      // Khởi tạo client
      const clientInitialized = await this.initializeClient();
      if (!clientInitialized) {
        throw new Error('Không thể khởi tạo Telegram client');
      }

      // Đăng ký event handlers
      this.setupEventHandlers();

      // Get thông tin user
      const me = await this.client.getMe();
      Utils.log(`👤 Đăng nhập như: ${me.firstName} ${me.lastName || ''} (@${me.username || 'no_username'})`);

      this.isRunning = true;
      Utils.log('✅ UserBot đã sẵn sàng hoạt động!');
      Utils.log('📝 Gõ /help trong bất kỳ chat nào để xem hướng dẫn');
      Utils.log(`🔄 Duplicate protection: ACTIVE`);
      Utils.log(`📊 Process ID: ${process.pid}`);

      // Keep alive
      while (this.isRunning) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

    } catch (error) {
      Utils.log(`❌ Lỗi khi khởi chạy bot: ${error.message}`);
      this.cleanup();
      process.exit(1);
    }
  }

  // Dừng bot
  stop() {
    Utils.log('🛑 Đang dừng bot...');
    this.isRunning = false;
    if (this.client) {
      this.client.disconnect();
    }
    this.cleanup();
  }
}

// Khởi chạy bot
const bot = new BankTransactionUserbot();

// Handle process signals
process.on('SIGINT', () => {
  Utils.log('📤 Nhận tín hiệu SIGINT, đang dừng bot...');
  bot.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  Utils.log('📤 Nhận tín hiệu SIGTERM, đang dừng bot...');
  bot.stop();
  process.exit(0);
});

// Bắt lỗi không được handle
process.on('unhandledRejection', (reason, promise) => {
  Utils.log('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  Utils.log('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Start bot
bot.start(); 