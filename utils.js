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

  // Kiểm tra tin nhắn có hình ảnh không
  static hasPhoto(message) {
    if (!message) return false;
    
    // Kiểm tra message có media không
    if (message.media) {
      // Kiểm tra các loại media chứa hình ảnh
      if (message.media.className === 'MessageMediaPhoto') {
        return true;
      }
      
      // Kiểm tra document (có thể là sticker, GIF, hoặc file hình ảnh)
      if (message.media.className === 'MessageMediaDocument') {
        const document = message.media.document;
        if (document && document.mimeType) {
          // Kiểm tra MIME type của hình ảnh
          return document.mimeType.startsWith('image/');
        }
      }
    }
    
    return false;
  }

  // Kiểm tra user match với target (username hoặc user ID)
  static isTargetUser(sender, targetUser) {
    if (!sender || !targetUser) return false;
    
    // Kiểm tra username
    if (targetUser.startsWith('@')) {
      const username = targetUser.slice(1); // Remove @
      return sender.username && sender.username.toLowerCase() === username.toLowerCase();
    }
    
    // Kiểm tra user ID
    if (targetUser.match(/^\d+$/)) {
      return sender.id && sender.id.toString() === targetUser;
    }
    
    return false;
  }

  // =================  FORWARD RULES FUNCTIONS =================

  // Thêm forward rule mới
  static addForwardRule(settings, sourceGroupId, destGroupId, trigger, createdBy) {
    if (!settings.forwardRules) {
      settings.forwardRules = [];
    }

    // Normalize trigger (chỉ lowercase cho text, giữ nguyên emoji)
    const normalizedTrigger = Utils.normalizeTrigger(trigger);

    // Kiểm tra rule đã tồn tại chưa
    const existingRule = settings.forwardRules.find(rule => 
      rule.sourceGroupId === sourceGroupId && 
      rule.destGroupId === destGroupId && 
      rule.trigger === normalizedTrigger
    );
    
    if (existingRule) {
      return { success: false, message: 'Rule đã tồn tại!' };
    }
    
    // Thêm rule mới
    const newRule = {
      sourceGroupId: sourceGroupId,
      destGroupId: destGroupId,
      trigger: normalizedTrigger,
      createdBy: createdBy,
      createdTime: new Date().toISOString(),
      status: "active"
    };
    
    settings.forwardRules.push(newRule);
    return { success: true, rule: newRule };
  }

  // Xóa forward rule
  static removeForwardRule(settings, sourceGroupId, destGroupId, trigger) {
    if (!settings.forwardRules) {
      return { success: false, message: 'Không tìm thấy rule nào!' };
    }

    const normalizedTrigger = Utils.normalizeTrigger(trigger);
    
    const index = settings.forwardRules.findIndex(rule => 
      rule.sourceGroupId === sourceGroupId && 
      rule.destGroupId === destGroupId && 
      rule.trigger === normalizedTrigger
    );
    
    if (index !== -1) {
      const removedRule = settings.forwardRules[index];
      settings.forwardRules.splice(index, 1);
      return { success: true, rule: removedRule };
    }
    
    return { success: false, message: 'Không tìm thấy rule này!' };
  }

  // Tìm forward rule phù hợp
  static findForwardRule(settings, sourceGroupId, trigger) {
    if (!settings.forwardRules) {
      return null;
    }

    const normalizedTrigger = Utils.normalizeTrigger(trigger);

    return settings.forwardRules.find(rule => 
      rule.sourceGroupId === sourceGroupId && 
      rule.trigger === normalizedTrigger && 
      rule.status === "active"
    );
  }

  // Lấy tất cả active forward rules
  static getActiveForwardRules(settings) {
    if (!settings.forwardRules) {
      return [];
    }

    return settings.forwardRules.filter(rule => rule.status === "active");
  }

  // =================  MESSAGE COPY FUNCTIONS =================

  // Xác định loại tin nhắn
  static getMessageType(message) {
    if (!message) return "unknown";
    
    // Kiểm tra xem có phải media group (album) không
    if (message.groupedId) {
      if (message.photo) return "album ảnh";
      if (message.video) return "album video";
      if (message.document) return "album file";
      return "album media";
    }
    
    if (message.photo) return "ảnh";
    if (message.video) return "video";
    if (message.document) return "file";
    if (message.audio) return "audio";
    if (message.voice) return "voice message";
    if (message.sticker) return "sticker";
    if (message.animation) return "animation";
    if (message.text || message.message) return "văn bản";
    
    return "nội dung khác";
  }

  // Kiểm tra xem tin nhắn có thể copy được không
  static canCopyMessage(message) {
    if (!message) return false;
    
    // Hỗ trợ copy text, photo, video, document, audio, voice, sticker, animation
    // Bao gồm cả media groups (albums)
    return message.text || message.message || message.photo || message.video || 
           message.document || message.audio || message.voice || 
           message.sticker || message.animation || message.groupedId;
  }

  // Kiểm tra xem tin nhắn có phải media group (album) không
  static isMediaGroup(message) {
    return message && message.groupedId !== undefined;
  }

  // Kiểm tra loại media trong group
  static getMediaGroupType(message) {
    if (!Utils.isMediaGroup(message)) return null;
    
    if (message.photo) return 'photo';
    if (message.video) return 'video';
    if (message.document) return 'document';
    
    // Check by media class name if direct properties not available
    if (message.media) {
      if (message.media.className === 'MessageMediaPhoto') return 'photo';
      if (message.media.className === 'MessageMediaDocument') {
        // Could be video, document, or other file type
        return 'document';
      }
    }
    
    return 'mixed';
  }

  // Validate Group ID format
  static isValidGroupId(groupId) {
    // Group ID phải là số âm (bắt đầu bằng -)
    return /^-\d+$/.test(groupId);
  }

  // Format thời gian cho hiển thị
  static formatDate(dateString) {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('vi-VN');
    } catch (error) {
      return 'Unknown date';
    }
  }

  // Normalize trigger (giữ nguyên emoji, lowercase text)
  static normalizeTrigger(trigger) {
    if (!trigger) return '';
    
    // Trim whitespace
    trigger = trigger.trim();
    
    // Kiểm tra nếu trigger chỉ chứa emoji (không có chữ/số)
    const emojiRegex = /^[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]+$/u;
    
    if (emojiRegex.test(trigger)) {
      // Nếu chỉ là emoji, giữ nguyên
      return trigger;
    }
    
    // Nếu có text, chuyển thành lowercase
    return trigger.toLowerCase();
  }

  // Kiểm tra xem string có chứa emoji không
  static hasEmoji(text) {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/u;
    return emojiRegex.test(text);
  }

  // Tách emoji và text từ string
  static extractEmojis(text) {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/gu;
    const emojis = text.match(emojiRegex) || [];
    const textWithoutEmojis = text.replace(emojiRegex, '').trim();
    
    return {
      emojis: emojis,
      text: textWithoutEmojis,
      hasEmoji: emojis.length > 0
    };
  }

  // ================= FORWARD2 RULES FUNCTIONS =================
  
  // Thêm forward2 rule mới (forward từ bất kỳ nhóm nào đến 1 nhóm cụ thể)
  static addForward2Rule(settings, destGroupId, trigger, createdBy) {
    if (!settings.forward2Rules) {
      settings.forward2Rules = [];
    }

    // Normalize trigger
    const normalizedTrigger = Utils.normalizeTrigger(trigger);

    // Kiểm tra rule đã tồn tại chưa
    const existingRule = settings.forward2Rules.find(rule => 
      rule.destGroupId === destGroupId && 
      rule.trigger === normalizedTrigger
    );
    
    if (existingRule) {
      return { success: false, message: 'Rule forward2 đã tồn tại!' };
    }
    
    // Thêm rule mới
    const newRule = {
      destGroupId: destGroupId,
      trigger: normalizedTrigger,
      createdBy: createdBy,
      createdTime: new Date().toISOString(),
      status: "active"
    };
    
    settings.forward2Rules.push(newRule);
    return { success: true, rule: newRule };
  }

  // Xóa forward2 rule
  static removeForward2Rule(settings, destGroupId, trigger) {
    if (!settings.forward2Rules) {
      return { success: false, message: 'Không tìm thấy rule forward2 nào!' };
    }

    const normalizedTrigger = Utils.normalizeTrigger(trigger);
    
    const index = settings.forward2Rules.findIndex(rule => 
      rule.destGroupId === destGroupId && 
      rule.trigger === normalizedTrigger
    );
    
    if (index !== -1) {
      const removedRule = settings.forward2Rules[index];
      settings.forward2Rules.splice(index, 1);
      return { success: true, rule: removedRule };
    }
    
    return { success: false, message: 'Không tìm thấy rule forward2 này!' };
  }

  // Tìm forward2 rule phù hợp (forward từ bất kỳ nhóm nào)
  static findForward2Rule(settings, trigger) {
    if (!settings.forward2Rules) {
      return null;
    }

    const normalizedTrigger = Utils.normalizeTrigger(trigger);

    return settings.forward2Rules.find(rule => 
      rule.trigger === normalizedTrigger && 
      rule.status === "active"
    );
  }

  // Lấy tất cả active forward2 rules
  static getActiveForward2Rules(settings) {
    if (!settings.forward2Rules) {
      return [];
    }

    return settings.forward2Rules.filter(rule => rule.status === "active");
  }

  // ================== ADMIN MANAGEMENT ==================

  // Add admin user
  static addAdmin(settings, userId) {
    if (!settings.adminUsers) {
      settings.adminUsers = [];
    }
    
    const userIdStr = userId.toString();
    
    if (settings.adminUsers.includes(userIdStr)) {
      return { success: false, message: 'User đã là admin rồi' };
    }
    
    settings.adminUsers.push(userIdStr);
    return { success: true, message: 'Đã thêm admin thành công' };
  }

  // Remove admin user
  static removeAdmin(settings, userId) {
    if (!settings.adminUsers) {
      settings.adminUsers = [];
      return { success: false, message: 'Không có admin nào' };
    }
    
    const userIdStr = userId.toString();
    const index = settings.adminUsers.indexOf(userIdStr);
    
    if (index === -1) {
      return { success: false, message: 'User không phải admin' };
    }
    
    settings.adminUsers.splice(index, 1);
    return { success: true, message: 'Đã xóa admin thành công' };
  }

  // Check if user is admin
  static isAdmin(settings, userId) {
    if (!settings.adminUsers || settings.adminUsers.length === 0) {
      return false;
    }
    
    const userIdStr = userId.toString();
    return settings.adminUsers.includes(userIdStr);
  }

  // Get all admin users
  static getAdminList(settings) {
    return settings.adminUsers || [];
  }
}

module.exports = Utils; 