const fs = require('fs');
const config = require('./config');

class Utils {
  // Load settings từ file
  static loadSettings() {
    try {
      if (fs.existsSync(config.settingsFile)) {
        const data = fs.readFileSync(config.settingsFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Lỗi khi load settings:', error);
    }
    
    // Return default settings nếu không load được
    return { ...config.defaultSettings };
  }

  // Save settings vào file
  static saveSettings(settings) {
    try {
      fs.writeFileSync(config.settingsFile, JSON.stringify(settings, null, 2));
      return true;
    } catch (error) {
      console.error('Lỗi khi save settings:', error);
      return false;
    }
  }

  // Kiểm tra xem tin nhắn có match pattern giao dịch ngân hàng không
  static isTransactionMessage(messageText) {
    if (!messageText) return false;

    // Pattern cho tin nhắn giao dịch
    const patterns = [
      /Tiền vào:\s*\+[\d,]+\s*đ/i,
      /Tài khoản:\s*\d+\s*tại\s*\w+/i,
      /Lúc:\s*\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}:\d{2}/i,
      /Nội dung CK:/i
    ];

    // Phải match tất cả các pattern
    return patterns.every(pattern => pattern.test(messageText));
  }

  // Parse command từ tin nhắn
  static parseCommand(messageText) {
    if (!messageText || !messageText.startsWith('/')) return null;

    const parts = messageText.trim().split(' ');
    return {
      command: parts[0].toLowerCase(),
      args: parts.slice(1)
    };
  }

  // Log với timestamp
  static log(message) {
    const timestamp = new Date().toLocaleString('vi-VN');
    console.log(`[${timestamp}] ${message}`);
  }

  // Format số tiền
  static formatAmount(text) {
    const match = text.match(/\+?([\d,]+)\s*đ/);
    return match ? match[1] : null;
  }

  // Extract account info
  static extractAccountInfo(text) {
    const accountMatch = text.match(/Tài khoản:\s*(\d+)\s*tại\s*(\w+)/i);
    const timeMatch = text.match(/Lúc:\s*(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}:\d{2})/i);
    const contentMatch = text.match(/Nội dung CK:\s*(.+)/i);

    return {
      account: accountMatch ? accountMatch[1] : null,
      bank: accountMatch ? accountMatch[2] : null,
      time: timeMatch ? timeMatch[1] : null,
      content: contentMatch ? contentMatch[1].trim() : null
    };
  }
}

module.exports = Utils; 