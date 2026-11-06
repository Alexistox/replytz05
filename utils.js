const fs = require('fs');
const crypto = require('crypto');
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

    // Tiếng Việt: đủ 4 trường (Tiền vào / Tài khoản / Lúc / Nội dung CK)
    const vnPatterns = [
      /Tiền vào:\s*\+[\d,]+\s*đ/i,
      /Tài khoản:\s*\d+\s*tại\s*\w+/i,
      /Lúc:\s*\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}:\d{2}/i,
      /Nội dung CK:/i,
    ];

    // Tiếng Trung (SMS/ngân hàng): 入款 / 账户 / 时间 / 备注 — hỗ trợ : hoặc ：
    const cnPatterns = [
      /入款[：:\uFF1A]\s*[+＋]?[\d,，．.\uFF0C]+\s*(?:元|块|CNY|￥)?/u,
      /账户[：:\uFF1A]\s*[\d\s*＊xXＸ\-\u2010‐]{4,}/u,
      /时间[：:\uFF1A]\s*(?:\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?|\d{4}年\d{1,2}月\d{1,2}日\s*\d{1,2}:\d{2}(?::\d{2})?)/u,
      /备注[：:\uFF1A]/u,
    ];

    const vnOk = vnPatterns.every((p) => p.test(messageText));
    const cnOk = cnPatterns.every((p) => p.test(messageText));
    return vnOk || cnOk;
  }

  // Parse command từ tin nhắn (bỏ @BotUsername sau lệnh — Telegram hay gửi /cal@bot on)
  static parseCommand(messageText) {
    if (!messageText || !messageText.startsWith('/')) return null;

    const parts = messageText.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;

    let command = parts[0].toLowerCase();
    const at = command.indexOf('@');
    if (at !== -1) {
      command = command.slice(0, at);
    }

    return {
      command,
      args: parts.slice(1),
    };
  }

  /** Chuẩn hóa user id (BigInt / Long / số) sang chuỗi so sánh */
  static normalizeUserId(id) {
    if (id == null) return '';
    if (typeof id === 'bigint') return id.toString();
    if (typeof id === 'number') return String(id);
    if (typeof id === 'object' && id.userId != null) {
      return Utils.normalizeUserId(id.userId);
    }
    if (typeof id === 'object' && typeof id.valueOf === 'function') {
      try {
        const v = id.valueOf();
        if (v !== id) return Utils.normalizeUserId(v);
      } catch (_e) {
        /* ignore */
      }
    }
    const t = String(id).trim();
    return t && !t.startsWith('[object ') ? t : '';
  }

  /** Chat id từ Message GramJS (supergroup thường là -100…) */
  static getMessageChatId(message) {
    if (!message) return '';
    const raw = message.chatId ?? message.peerId;
    if (raw == null) return '';
    if (typeof raw === 'bigint' || typeof raw === 'number') return raw.toString();
    if (typeof raw === 'string') return raw.trim();
    if (typeof raw === 'object') {
      if (raw.channelId != null) return `-100${Utils.normalizeUserId(raw.channelId)}`;
      if (raw.chatId != null) return `-${Utils.normalizeUserId(raw.chatId)}`;
    }
    const t = String(raw).trim();
    return t && !t.startsWith('[object ') ? t : '';
  }

  /** Lấy user ID người gửi (chuỗi) từ tin GramJS — ổn định hơn senderId?.toString() khi senderId là object/Long */
  static getMessageSenderUserId(message) {
    if (!message) return '';
    const sid = message.senderId;
    if (sid == null) return '';
    if (typeof sid === 'bigint') return sid.toString();
    if (typeof sid === 'number') return String(sid);
    if (typeof sid === 'string') return sid.trim();
    if (typeof sid === 'object') {
      if (sid.userId != null) {
        return Utils.getMessageSenderUserId({ senderId: sid.userId });
      }
      if (typeof sid.valueOf === 'function') {
        try {
          const v = sid.valueOf();
          if (v !== sid) return Utils.getMessageSenderUserId({ senderId: v });
        } catch (_e) {
          /* ignore */
        }
      }
    }
    try {
      const t = String(sid).trim();
      return t && !t.startsWith('[object ') ? t : '';
    } catch (_e) {
      return '';
    }
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

  // Kiểm tra user match với target (username, user ID, hoặc self/me = tài khoản bot)
  static isTargetUser(sender, targetUser, botUser = null) {
    if (!sender || !targetUser) return false;

    const target = String(targetUser).trim();
    const selfAliases = ['self', 'me', '@me'];
    if (selfAliases.includes(target.toLowerCase())) {
      if (!botUser) return false;
      return Utils.normalizeUserId(sender.id) === Utils.normalizeUserId(botUser.id);
    }

    // Kiểm tra username
    if (target.startsWith('@')) {
      const username = target.slice(1);
      return sender.username && sender.username.toLowerCase() === username.toLowerCase();
    }

    // Kiểm tra user ID
    if (target.match(/^\d+$/)) {
      return Utils.normalizeUserId(sender.id) === target;
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

  // Tìm forward rule phù hợp; cùng nhóm nguồn + trigger thì rule tạo sau được ưu tiên
  static findForwardRule(settings, sourceGroupId, trigger) {
    if (!settings.forwardRules) {
      return null;
    }

    const normalizedTrigger = Utils.normalizeTrigger(trigger);
    let latest = null;

    for (const rule of settings.forwardRules) {
      if (
        rule.sourceGroupId !== sourceGroupId ||
        rule.trigger !== normalizedTrigger ||
        rule.status !== "active"
      ) {
        continue;
      }
      if (!latest || (rule.createdTime || '') >= (latest.createdTime || '')) {
        latest = rule;
      }
    }

    return latest;
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
    
    // GramJS: thường có .media; bot cũ kiểm tra .photo/.video từ API khác
    return !!(
      message.text ||
      message.message ||
      message.media ||
      message.groupedId ||
      message.photo ||
      message.video ||
      message.document ||
      message.audio ||
      message.voice ||
      message.sticker ||
      message.animation
    );
  }

  // Kiểm tra xem tin nhắn có phải media group (album) không
  // Lưu ý: GramJS đôi khi có groupedId: null — null !== undefined nên trước đây bị nhầm là album → "Invalid groupedId: null"
  static isMediaGroup(message) {
    if (!message) return false;
    const g = message.groupedId;
    return g !== undefined && g !== null;
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

  /** Tắt bộ lọc: COPY_POLICY_FILTER=0 hoặc false */
  static isCopyPolicyFilterEnabled() {
    const v = process.env.COPY_POLICY_FILTER;
    return v !== '0' && v !== 'false';
  }

  static _normalizeForPolicyMatch(s) {
    if (!s || typeof s !== 'string') return '';
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'd');
  }

  /** Chuỗi con (Latin/VN): nếu một dòng caption chứa → bỏ cả dòng khi copy */
  static getCopyPolicyLineSubstrings() {
    return [
      'casino', 'slot game', 'game slot', 'no hu', 'nổ hũ', 'nohu', 'tai xiu', 'tài xỉu',
      'xoc dia', 'xóc đĩa', 'ca do', 'cá độ', 'ca cuoc', 'cá cược', 'keo nha', 'kèo nhà',
      'kubet', 'jun88', 'hi88', 'shbet', 'fb88', '789bet', 'f8bet', 'debet', 'ae88',
      'm88.com', 'w88', 'vwin', 'bk8', 'cmd368', '188bet', '12bet', 'letou',
      'dang ky nhan', 'đăng ký nhận', 'nap lan dau', 'nạp lần đầu', 'hoan tra', 'hoàn trả',
      'tang thuong', 'tặng thưởng', 'giftcode', 'gift code', 'link dang ky', 'link đăng ký',
      'game bai', 'game bài', 'baccarat', 'poker online', 'xổ số online', 'xo so online',
      'quang cao', 'quảng cáo', '#ad', 'sponsored', 'affiliate',
      'nhan thuong mien phi', 'nhận thưởng miễn phí', 'uu dai', 'ưu đãi khủng',
      'choi ngay', 'chơi ngay', 'dang ky ngay', 'đăng ký ngay', 'telegram bot game',
    ];
  }

  /**
   * Tiếng Trung (giản thể/phồn thể thường gặp) + từ la tinh trong spam cờ bạc TQ
   * So khớp trực tiếp trên chuỗi gốc (không bỏ dấu CJK).
   */
  static getCopyPolicyChineseSubstrings() {
    return [
      '博彩', '娱乐城', '线上娱乐', '真人娱乐', '电子真人', '体育真人', '真人盘',
      '赌场', '实体赌场', '线上下注', '线上博彩', '华人博彩', '博彩娱乐', '博彩平台',
      '出款', '提款', '提现', '秒出', '秒出款', '秒提款', '不限提款', '提款无上限',
      '注册就送', '注册送', '神秘彩金', '首存', '存款送', '存款天天送', '大派送',
      '福利拉满', '全网首发', '品牌铸就', '耗资百', '耗资10亿', '耗资10亿美金',
      '行业第一', '业界龙头', '顶级品牌', '全球布局', '娱乐造富', '无惧爆庄',
      '百亿任提', '华人专属', '包出款', '零审核', '0审核', '相信品牌', '值得信赖',
      '老品牌', '创造人生', '新财富', '联合双担保', '钱庄', '每日亏损', '每日返',
      '实力U台', 'U台', '柬埔寨', '东南亚', '亚太', 'PG集团', '8cc集团', 'QSTY',
      'Y3国际', 'N1国际', '2028体育', '汉城出海', '娱乐首选', '豪赌', '爆大奖',
      '提款次数', '提款额度', '全球顶级华人', '百家乐', '电子百家乐',
      '相信品牌的力量', '娱乐城点击', '最优质的博彩', '长期储备资金',
      '集团耗资', '打造全网最顶级', '线上娱乐城', '博彩娱乐城',
    ];
  }

  static countCjkIdeographs(line) {
    if (!line) return 0;
    const m = line.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g);
    return m ? m.length : 0;
  }

  /**
   * Heuristic: dòng có nhiều chữ Hán + mẫu quảng cáo cờ bạc (khối【】, domain + từ khóa…)
   */
  static lineMatchesChineseGamblingHeuristic(line) {
    const cjk = Utils.countCjkIdeographs(line);
    if (cjk < 6) return false;

    const gamblingChars = /[博彩赌彩娱城金款注盘提送注册银亿萬万U台资]/.test(line);
    if (cjk >= 8 && gamblingChars && /【[^】]{8,}】/.test(line)) {
      return true;
    }

    if (cjk >= 10 && /\.(com|net|vip|cc|bet|top|org)\b/i.test(line) && gamblingChars) {
      return true;
    }

    if (cjk >= 14 && /(国际|集团|平台|品牌|实力|全球|顶级|专属)/.test(line) && gamblingChars) {
      return true;
    }

    if (cjk >= 6 && /(欢迎加入|点击导航|联系人：|客服)/.test(line) && gamblingChars) {
      return true;
    }

    return false;
  }

  static lineMatchesChineseCopyBlacklist(line) {
    if (!line) return false;
    if (Utils.getCopyPolicyChineseSubstrings().some((kw) => line.includes(kw))) {
      return true;
    }
    if (Utils.lineMatchesChineseGamblingHeuristic(line)) {
      return true;
    }
    return false;
  }

  static lineMatchesCopyPolicyBlacklist(line) {
    if (!line || !Utils.isCopyPolicyFilterEnabled()) return false;
    if (Utils.lineMatchesChineseCopyBlacklist(line)) {
      return true;
    }
    const n = Utils._normalizeForPolicyMatch(line);
    if (!n) return false;
    if (/https?:\/\/[^\s]*(?:kubet|jun88|hi88|shbet|fb88|789bet|f8bet|casino|88bet|debet|bk8|cmd368)[^\s]*/i.test(line)) {
      return true;
    }
    return Utils.getCopyPolicyLineSubstrings().some((kw) =>
      n.includes(Utils._normalizeForPolicyMatch(kw))
    );
  }

  /** Loại bỏ dòng chứa QC/cờ bạc; thu gọn khoảng trắng */
  static sanitizeCopyText(text) {
    if (!text || typeof text !== 'string') return '';
    if (!Utils.isCopyPolicyFilterEnabled()) return text;
    const lines = text.split(/\n/);
    const kept = lines.filter((line) => !Utils.lineMatchesCopyPolicyBlacklist(line));
    return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /** Pic2: bỏ qua reply nếu caption ảnh là "x" hoặc "0" (không phân biệt hoa thường với x) */
  static shouldSkipPic2DueToCaption(message) {
    if (!message) return false;
    const caption = (message.message || message.text || '').trim();
    if (!caption) return false;
    const lower = caption.toLowerCase();
    return lower === 'x' || caption === '0';
  }

  /** Setforward mirror: reply ở nhóm B đúng chữ 1 / 2 / 3 */
  static isForwardMirrorConfirmText(text) {
    if (text == null) return false;
    const t = String(text).trim();
    return t === '1' || t === '2' || t === '3';
  }

  /** Chuẩn hóa user id cho /trigger (số, @user, self/me) → chuỗi lưu settings */
  static normalizeMirrorTriggerUserRef(userRef, botUser = null) {
    if (userRef == null) return '';
    const raw = String(userRef).trim();
    if (!raw) return '';
    const lower = raw.toLowerCase();
    if (lower === 'self' || lower === 'me' || lower === '@me') {
      return botUser ? Utils.normalizeUserId(botUser.id) : 'self';
    }
    if (raw.startsWith('@')) return raw.toLowerCase();
    return Utils.normalizeUserId(raw) || raw;
  }

  static getMirrorTriggerUsers(settings, groupId) {
    if (!settings?.mirrorTriggers || typeof settings.mirrorTriggers !== 'object') {
      return [];
    }
    for (const gid of Utils.getAlternateGroupIds(groupId)) {
      const list = settings.mirrorTriggers[gid];
      if (Array.isArray(list)) return list.map(String);
    }
    return [];
  }

  static isMirrorTriggerUser(settings, groupId, userId, botUser = null, sender = null) {
    const uid = Utils.normalizeUserId(userId);
    const list = Utils.getMirrorTriggerUsers(settings, groupId);
    if (!list.length) return false;
    for (const entry of list) {
      const e = String(entry).trim();
      if (!e) continue;
      if (e.startsWith('@')) {
        const uname = sender?.username || '';
        if (uname && uname.toLowerCase() === e.slice(1).toLowerCase()) return true;
        continue;
      }
      if (uid && Utils.normalizeUserId(e) === uid) return true;
      if ((e === 'self' || e === 'me') && botUser && uid && Utils.normalizeUserId(botUser.id) === uid) {
        return true;
      }
    }
    return false;
  }

  static addMirrorTriggerUser(settings, groupId, userRef, botUser = null) {
    if (!settings.mirrorTriggers || typeof settings.mirrorTriggers !== 'object') {
      settings.mirrorTriggers = {};
    }
    const gid = String(groupId);
    const stored = Utils.normalizeMirrorTriggerUserRef(userRef, botUser);
    if (!stored) return { success: false, message: 'User ID không hợp lệ' };
    if (!settings.mirrorTriggers[gid]) settings.mirrorTriggers[gid] = [];
    const list = settings.mirrorTriggers[gid];
    if (list.some((x) => String(x) === stored)) {
      return { success: false, message: 'User đã có trong danh sách trigger' };
    }
    list.push(stored);
    return { success: true, userId: stored };
  }

  static removeMirrorTriggerUser(settings, groupId, userRef, botUser = null) {
    if (!settings.mirrorTriggers || typeof settings.mirrorTriggers !== 'object') {
      return { success: false, message: 'Chưa có trigger nào' };
    }
    const stored = Utils.normalizeMirrorTriggerUserRef(userRef, botUser);
    for (const gid of Utils.getAlternateGroupIds(groupId)) {
      const list = settings.mirrorTriggers[gid];
      if (!Array.isArray(list)) continue;
      const idx = list.findIndex((x) => String(x) === stored);
      if (idx === -1) continue;
      list.splice(idx, 1);
      if (list.length === 0) delete settings.mirrorTriggers[gid];
      return { success: true, userId: stored };
    }
    return { success: false, message: 'Không tìm thấy user trong trigger của nhóm này' };
  }

  /** Forward giữ nguyên caption gốc — bỏ qua nếu toàn bộ chữ là QC/cờ bạc (đã lọc hết) */
  static shouldSkipForwardDueToCopyPolicy(message) {
    if (!message || !Utils.isCopyPolicyFilterEnabled()) return false;
    const raw = (message.message || message.text || '').trim();
    if (raw.length < 8) return false;
    const cleaned = Utils.sanitizeCopyText(raw);
    return cleaned.length === 0;
  }

  /** Tin chỉ chữ mà sau lọc không còn nội dung → không gửi */
  static shouldSkipTextOnlyCopyDueToPolicy(message) {
    if (!message || !Utils.isCopyPolicyFilterEnabled()) return false;
    if (message.media || message.groupedId != null) return false;
    const raw = (message.message || message.text || '').trim();
    if (raw.length < 6) return false;
    return Utils.sanitizeCopyText(raw).length === 0;
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

  static getPermanentAdminUserIds() {
    const raw = config.permanentAdminUserIds;
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.map((id) => String(id).trim()).filter(Boolean);
  }

  static isPermanentAdmin(userId) {
    const id = String(userId == null ? '' : userId).trim();
    if (!id) return false;
    return Utils.getPermanentAdminUserIds().includes(id);
  }

  // Add admin user
  static addAdmin(settings, userId) {
    if (!settings.adminUsers) {
      settings.adminUsers = [];
    }

    const userIdStr = userId.toString();

    if (Utils.isPermanentAdmin(userIdStr)) {
      return { success: false, message: 'User này đã là admin cố định (config)' };
    }

    if (settings.adminUsers.includes(userIdStr)) {
      return { success: false, message: 'User đã là admin rồi' };
    }

    settings.adminUsers.push(userIdStr);
    return { success: true, message: 'Đã thêm admin thành công' };
  }

  // Remove admin user
  static removeAdmin(settings, userId) {
    const userIdStr = userId.toString();
    if (Utils.isPermanentAdmin(userIdStr)) {
      return { success: false, message: 'Không thể xóa admin cố định trong config' };
    }

    if (!settings.adminUsers) {
      settings.adminUsers = [];
      return { success: false, message: 'Không có admin nào' };
    }

    const index = settings.adminUsers.indexOf(userIdStr);
    
    if (index === -1) {
      return { success: false, message: 'User không phải admin' };
    }
    
    settings.adminUsers.splice(index, 1);
    return { success: true, message: 'Đã xóa admin thành công' };
  }

  // Check if user is admin
  static isAdmin(settings, userId) {
    const userIdStr = userId.toString();
    if (Utils.isPermanentAdmin(userIdStr)) {
      return true;
    }
    if (!settings.adminUsers || settings.adminUsers.length === 0) {
      return false;
    }
    return settings.adminUsers.includes(userIdStr);
  }

  // Get all admin users (gồm admin cố định trong config + adminUsers)
  static getAdminList(settings) {
    const fromSettings = settings.adminUsers || [];
    const out = [];
    const seen = new Set();
    for (const id of Utils.getPermanentAdminUserIds()) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    for (const id of fromSettings) {
      const s = String(id).trim();
      if (s && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
    return out;
  }

  // ================== PIC2 SETTINGS ==================

  static newPic2RuleId() {
    return crypto.randomBytes(4).toString('hex');
  }

  /** Migrate pic2Settings: mỗi group là mảng rule có id; object cũ (một rule) -> mảng một phần tử */
  static normalizePic2Settings(settings) {
    if (!settings.pic2Settings || typeof settings.pic2Settings !== 'object') {
      return false;
    }
    let changed = false;
    for (const gid of Object.keys(settings.pic2Settings)) {
      const v = settings.pic2Settings[gid];
      if (Array.isArray(v)) {
        for (const r of v) {
          if (r && typeof r === 'object' && !r.id) {
            r.id = Utils.newPic2RuleId();
            changed = true;
          }
        }
        continue;
      }
      if (v && typeof v === 'object' && v.targetUser != null) {
        settings.pic2Settings[gid] = [{ ...v, id: v.id || `legacy_${gid}` }];
        changed = true;
      }
    }
    return changed;
  }

  static countPic2Rules(settings) {
    if (!settings.pic2Settings) return 0;
    let n = 0;
    for (const v of Object.values(settings.pic2Settings)) {
      if (Array.isArray(v)) n += v.length;
    }
    return n;
  }

  /** Cùng một nhóm Telegram có thể lưu ID dạng -100… hoặc -… ngắn hơn */
  static getAlternateGroupIds(groupId) {
    const id = String(groupId);
    const alts = new Set([id]);
    if (id.startsWith('-100') && id.length > 4) {
      alts.add(`-${id.slice(4)}`);
    } else if (/^-\d+$/.test(id)) {
      alts.add(`-100${id.slice(1)}`);
    }
    return Array.from(alts);
  }

  static getPic2RulesForGroup(settings, groupId) {
    if (!settings?.pic2Settings) return [];
    for (const gid of Utils.getAlternateGroupIds(groupId)) {
      const raw = settings.pic2Settings[gid];
      if (!raw) continue;
      if (Array.isArray(raw)) return raw;
      if (raw && typeof raw === 'object' && raw.targetUser != null) return [raw];
    }
    return [];
  }

  // ================== COPYALL / NEWCOPY ==================

  static makeCopyWatermarkKey(sourceId, destId) {
    return `${String(sourceId)}_${String(destId)}`;
  }

  /**
   * Parse mốc thời gian cho /copyall: relative (24h, 7d, 2w) hoặc ngày UTC YYYY-MM-DD
   * @returns {{ minDateSec: number } | { error: string }}
   */
  static parseCopyTimeArg(str) {
    if (!str || typeof str !== 'string') {
      return { error: 'Thiếu mốc thời gian' };
    }
    const s = str.trim();
    const rel = /^(\d+)([hdw])$/i.exec(s);
    if (rel) {
      const n = parseInt(rel[1], 10);
      const u = rel[2].toLowerCase();
      const secPerUnit = u === 'h' ? 3600 : u === 'd' ? 86400 : 7 * 86400;
      const minDateSec = Math.floor(Date.now() / 1000) - n * secPerUnit;
      return { minDateSec };
    }
    const dateM = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (dateM) {
      const y = parseInt(dateM[1], 10);
      const mo = parseInt(dateM[2], 10) - 1;
      const d = parseInt(dateM[3], 10);
      const minDateSec = Math.floor(Date.UTC(y, mo, d, 0, 0, 0) / 1000);
      return { minDateSec };
    }
    return {
      error: 'Mốc thời gian không hợp lệ. Dùng: 24h, 7d, 2w hoặc YYYY-MM-DD (UTC 00:00)',
    };
  }

  /**
   * Tách thời gian và sourceId từ args /copyall (thứ tự bất kỳ)
   * @returns {{ timeArg: string, sourceId: string } | { error: string }}
   */
  static parseCopyallArgs(args) {
    if (!args || args.length < 2) {
      return { error: 'Thiếu tham số. Dùng: /copyall <thời gian> <id nguồn>' };
    }
    const idTokens = args.filter((t) => /^-?\d+$/.test(String(t).trim()));
    const timeTokens = args.filter((t) => !/^-?\d+$/.test(String(t).trim()));
    if (idTokens.length !== 1 || timeTokens.length !== 1) {
      return {
        error:
          'Cần đúng một ID nhóm/kênh (số) và một mốc thời gian (vd: 7d, 2025-01-15)',
      };
    }
    return { timeArg: timeTokens[0].trim(), sourceId: idTokens[0].trim() };
  }

  // ================== CAL (/cal máy tính) ==================

  static _mathCalInstance = null;

  static getMathCal() {
    if (!Utils._mathCalInstance) {
      const { create, all } = require('mathjs');
      Utils._mathCalInstance = create(all, {});
    }
    return Utils._mathCalInstance;
  }

  /** Tránh reply nhầm chat / ngày; số đơn thuần (vd 100) không coi là biểu thức */
  /**
   * Tìm URL tin nhắn Telegram trong args hoặc chuỗi
   * @returns {string|null}
   */
  static extractTelegramMessageLink(textOrArgs) {
    const text = Array.isArray(textOrArgs)
      ? textOrArgs.join(' ')
      : String(textOrArgs || '');
    if (!text.trim()) return null;
    const m = text.match(
      /(?:https?:\/\/)?(?:t\.me|telegram\.me|telegram\.dog)\/[^\s<>"']+/i
    );
    return m ? m[0].replace(/[),.;]+$/, '') : null;
  }

  /**
   * Parse link tin nhắn Telegram → peer + messageId
   * Hỗ trợ:
   * - https://t.me/c/1234567890/42
   * - https://t.me/c/1234567890/99/42 (forum: topic/msg)
   * - https://t.me/username/42
   * - https://t.me/username/42?single
   * @returns {{ username: string, messageId: number } | { chatId: string, messageId: number } | { error: string }}
   */
  static parseTelegramMessageLink(input) {
    if (!input || typeof input !== 'string') {
      return { error: 'Thiếu link tin nhắn Telegram' };
    }
    let raw = input.trim();
    const extracted = Utils.extractTelegramMessageLink(raw);
    if (extracted) raw = extracted;

    raw = raw.replace(/[),.;]+$/, '');
    if (!/^https?:\/\//i.test(raw)) {
      raw = `https://${raw}`;
    }

    let url;
    try {
      url = new URL(raw);
    } catch (_e) {
      return { error: 'Link không hợp lệ' };
    }

    const host = (url.hostname || '').toLowerCase();
    if (!['t.me', 'telegram.me', 'telegram.dog', 'www.t.me'].includes(host)) {
      return { error: 'Chỉ hỗ trợ link t.me / telegram.me' };
    }

    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) {
      return {
        error:
          'Link thiếu message id. Ví dụ: https://t.me/c/123/456 hoặc https://t.me/channel/456',
      };
    }

    // Private/supergroup: /c/<internalId>/<msgId> hoặc /c/<internalId>/<topicId>/<msgId>
    if (parts[0].toLowerCase() === 'c') {
      const internalId = parts[1];
      if (!/^\d+$/.test(internalId)) {
        return { error: 'ID kênh/nhóm trong link /c/ không hợp lệ' };
      }
      let messageIdStr;
      if (parts.length >= 4 && /^\d+$/.test(parts[2]) && /^\d+$/.test(parts[3])) {
        messageIdStr = parts[3];
      } else if (parts.length >= 3 && /^\d+$/.test(parts[2])) {
        messageIdStr = parts[2];
      } else {
        return { error: 'Không đọc được message id từ link /c/...' };
      }
      const messageId = parseInt(messageIdStr, 10);
      if (!messageId || messageId < 1) {
        return { error: 'Message id không hợp lệ' };
      }
      return {
        chatId: `-100${internalId}`,
        messageId,
      };
    }

    // Public: /username/<msgId>
    const username = parts[0];
    if (
      !username ||
      /^(joinchat|addstickers|share|proxy|socks|iv|s)$/i.test(username)
    ) {
      return { error: 'Link không phải link tin nhắn' };
    }
    if (!/^\d+$/.test(parts[1])) {
      return { error: 'Message id trong link phải là số' };
    }
    const messageId = parseInt(parts[1], 10);
    if (!messageId || messageId < 1) {
      return { error: 'Message id không hợp lệ' };
    }
    return { username, messageId };
  }

  /**
   * Story link: https://t.me/username/s/12
   * @returns {RegExp}
   */
  static getStoryLinkRegex() {
    return /^(?:https?:\/\/)?(?:www\.)?(?:t(?:elegram)?\.(?:me|dog|org))\/([A-Za-z0-9_]+)\/s\/(\d+)\/?$/i;
  }

  static isTelegramStoryLink(input) {
    if (!input || typeof input !== 'string') return false;
    let raw = input.trim().replace(/[),.;]+$/, '');
    const extracted = Utils.extractTelegramMessageLink(raw);
    if (extracted) raw = extracted;
    raw = raw.split('?', 1)[0].trim();
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    try {
      const url = new URL(raw);
      const host = (url.hostname || '').toLowerCase();
      if (!['t.me', 'telegram.me', 'telegram.dog', 'www.t.me', 'telegram.org', 'www.telegram.org'].includes(host)) {
        return false;
      }
      const parts = url.pathname.split('/').filter(Boolean);
      return (
        parts.length >= 3 &&
        parts[1].toLowerCase() === 's' &&
        /^\d+$/.test(parts[2]) &&
        !/^(joinchat|addstickers|share|proxy|socks|iv|c)$/i.test(parts[0])
      );
    } catch (_e) {
      return false;
    }
  }

  /**
   * @returns {{ username: string, storyId: number } | { error: string }}
   */
  static parseTelegramStoryLink(input) {
    if (!input || typeof input !== 'string') {
      return { error: 'Thiếu link story Telegram' };
    }
    let raw = input.trim().replace(/[),.;]+$/, '');
    const extracted = Utils.extractTelegramMessageLink(raw);
    if (extracted) raw = extracted;
    raw = raw.split('?', 1)[0].trim();
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

    try {
      const url = new URL(raw);
      const host = (url.hostname || '').toLowerCase();
      if (!['t.me', 'telegram.me', 'telegram.dog', 'www.t.me', 'telegram.org', 'www.telegram.org'].includes(host)) {
        return { error: 'Chỉ hỗ trợ link t.me story' };
      }
      const parts = url.pathname.split('/').filter(Boolean);
      if (
        parts.length < 3 ||
        parts[1].toLowerCase() !== 's' ||
        !/^\d+$/.test(parts[2])
      ) {
        return {
          error:
            'Link story không hợp lệ. Ví dụ: https://t.me/username/s/12',
        };
      }
      const username = parts[0];
      if (
        !username ||
        /^(joinchat|addstickers|share|proxy|socks|iv|c)$/i.test(username)
      ) {
        return { error: 'Username story không hợp lệ' };
      }
      const storyId = parseInt(parts[2], 10);
      if (!storyId || storyId < 1) {
        return { error: 'Story id không hợp lệ' };
      }
      return { username, storyId };
    } catch (_e) {
      return { error: 'Link story không hợp lệ' };
    }
  }

  /** Khóa peer để so khớp 2 link post (/bdl) */
  static messageLinkPeerKey(parsed) {
    if (!parsed || parsed.error) return null;
    if (parsed.chatId) return `id:${String(parsed.chatId)}`;
    if (parsed.username) return `user:${String(parsed.username).toLowerCase()}`;
    return null;
  }

  static sameMessageLinkPeer(a, b) {
    const ka = Utils.messageLinkPeerKey(a);
    const kb = Utils.messageLinkPeerKey(b);
    return !!(ka && kb && ka === kb);
  }

  static sameStoryLinkPeer(a, b) {
    if (!a || !b || a.error || b.error) return false;
    if (!a.username || !b.username) return false;
    return String(a.username).toLowerCase() === String(b.username).toLowerCase();
  }

  /** Cap khoảng /bdl /bdls mỗi lần (env BDL_MAX_RANGE, mặc định 200) */
  static getBdlMaxRange() {
    const n = parseInt(process.env.BDL_MAX_RANGE || '200', 10);
    return Number.isFinite(n) && n > 0 ? n : 200;
  }

  static isCalCandidate(raw) {
    if (!raw || typeof raw !== 'string') return false;
    const line = raw.trim().split('\n')[0].trim();
    if (!line || line.length > 280) return false;
    if (!/\d/.test(line)) return false;
    if (/^\d{4}-\d{1,2}-\d{1,2}\b/.test(line)) return false;
    if (/\b\d{4}-\d{2}-\d{2}\b/.test(line)) return false;
    return (
      /\d\s*(tr|m|b|k|n|tỷ|ty)\b/iu.test(line) ||
      /(\d+)(tr|m|b|tỷ|ty|t)\d/iu.test(line) ||
      /[+*^/]/.test(line) ||
      /sqrt|sin|cos|tan|log|exp|abs|pow|floor|ceil|round|mod|\bpi\b|\be\b/i.test(line) ||
      /\(/.test(line) ||
      /\d\s*-\s*\d/.test(line)
    );
  }

  /**
   * k,n = nghìn; tr, m = triệu; tỷ, ty, b, t = tỷ
   * Dính: XtrY = (X + Y/10^len(Y)) * 1e6; XtrYk = X*1e6 + Y*1e3 (tỷ: *1e9)
   */
  static preprocessCalExpression(s) {
    let t = s.trim().split('\n')[0].trim();
    if (!t) return t;

    const billyU = (u) => {
      const x = (u + '').toLowerCase();
      return x === 't' || x === 'tỷ' || x === 'ty' || x === 'b';
    };

    // 1) 1tr50k, 1b30k, 1m50k: cơ sở lớn + nghìn; t = tỷ dính (1t30)
    t = t.replace(
      /(\d+)(tr|m|tỷ|ty|b|t)([0-9]+)([kn])\b/giu,
      (match, a, u, c) => {
        const base = billyU(u) ? 1e9 : 1e6;
        return '(' + (parseInt(a, 10) * base + parseInt(c, 10) * 1e3) + ')';
      }
    );

    // 2) 1tr50, 1b30: (X + Y/10^lenY) * base; không cho k/n ngay sau (đã ở bước 1)
    t = t.replace(
      /(\d+)(tr|m|tỷ|ty|b|t)([0-9]+)(?![0-9]|[kKnN])/giu,
      (match, a, u, c) => {
        const base = billyU(u) ? 1e9 : 1e6;
        return '(' + (parseInt(a, 10) + parseInt(c, 10) / 10 ** c.length) * base + ')';
      }
    );

    t = t.replace(
      /(\d+(?:\.\d+)?)\s*(tỷ|ty|b)(?![a-z0-9_])/giu,
      '($1*1e9)'
    );
    t = t.replace(/(\d+(?:\.\d+)?)\s*tr\b/giu, '($1*1e6)');
    t = t.replace(/(\d+(?:\.\d+)?)\s*m(?![a-z0-9_])\b/iu, '($1*1e6)');
    t = t.replace(/(\d+(?:\.\d+)?)\s*[kn]\b/giu, '($1*1e3)');
    return t;
  }

  static formatNumberDisplay(n) {
    if (typeof n !== 'number' || Number.isNaN(n) || !Number.isFinite(n)) {
      return null;
    }
    if (Math.abs(n - Math.round(n)) < 1e-9) {
      return Math.round(n).toLocaleString('vi-VN');
    }
    return n.toLocaleString('vi-VN', { maximumFractionDigits: 12 });
  }

  static formatCalResult(value, math) {
    try {
      if (value == null) return null;
      if (value.type === 'Complex') {
        const re = value.re;
        const im = value.im;
        if (Math.abs(im) < 1e-12) {
          return Utils.formatNumberDisplay(Number(re));
        }
        const a = Utils.formatNumberDisplay(Number(re));
        const b = Utils.formatNumberDisplay(Number(im));
        if (a == null || b == null) return null;
        return `${a} + ${b}i`;
      }
      if (value.type === 'Matrix' || Array.isArray(value)) {
        return null;
      }
      const n = typeof value === 'number' ? value : Number(math.number(value));
      return Utils.formatNumberDisplay(n);
    } catch (_e) {
      return null;
    }
  }

  /** @returns {{ ok: true, text: string } | { ok: false }} */
  static tryEvaluateCal(raw) {
    try {
      if (!Utils.isCalCandidate(raw)) return { ok: false };
      if (Utils.isTransactionMessage(raw)) return { ok: false };
      const math = Utils.getMathCal();
      const expr = Utils.preprocessCalExpression(raw);
      const result = math.evaluate(expr);
      const text = Utils.formatCalResult(result, math);
      if (text == null) return { ok: false };
      return { ok: true, text };
    } catch (_e) {
      return { ok: false };
    }
  }

  /**
   * Chia text thành các phần ≤ maxLen (mặc định 4000, an toàn dưới giới hạn 4096 của Telegram).
   * Ưu tiên cắt tại xuống dòng gần cuối cửa sổ.
   * @param {string} text
   * @param {number} [maxLen=4000]
   * @returns {string[]}
   */
  static splitTelegramMessageChunks(text, maxLen = 4000) {
    const s = text == null ? '' : String(text);
    if (s.length === 0) {
      return [''];
    }
    if (s.length <= maxLen) {
      return [s];
    }
    const chunks = [];
    let i = 0;
    while (i < s.length) {
      let end = Math.min(i + maxLen, s.length);
      if (end < s.length) {
        const slice = s.slice(i, end);
        const nl = slice.lastIndexOf('\n');
        if (nl > 0 && nl >= Math.floor(maxLen * 0.35)) {
          end = i + nl + 1;
        }
      }
      chunks.push(s.slice(i, end));
      i = end;
      while (i < s.length && /\s/.test(s[i])) {
        i += 1;
      }
    }
    return chunks;
  }

  static RATE_UNAVAILABLE = '汇率暂时无法获取';

  static ensureRateDesk(settings) {
    let changed = false;
    if (!settings.rateDesk || typeof settings.rateDesk !== 'object' || Array.isArray(settings.rateDesk)) {
      settings.rateDesk = {};
      changed = true;
    }
    const desk = settings.rateDesk;
    if (desk.markup == null) {
      desk.markup = 230;
      changed = true;
    }
    if (desk.amount == null) {
      desk.amount = 100000000;
      changed = true;
    }
    if (desk.row == null) {
      desk.row = 5;
      changed = true;
    }
    if (desk.priceEnabled == null) {
      desk.priceEnabled = true;
      changed = true;
    }
    if (!desk.desks || typeof desk.desks !== 'object' || Array.isArray(desk.desks)) {
      desk.desks = {};
      changed = true;
    }
    if (!desk.customers || typeof desk.customers !== 'object' || Array.isArray(desk.customers)) {
      desk.customers = {};
      changed = true;
    }
    return changed;
  }

  /** null | 'price' | 'card'. Tin giao dịch ngân hàng không tính. */
  static detectRateAsk(text) {
    const raw = text == null ? '' : String(text);
    if (!raw.trim() || Utils.isTransactionMessage(raw)) return null;
    const card = /银行卡|要卡|换卡|卡号|卡/u.test(raw) || /\bka\b/i.test(raw);
    const price =
      raw.includes('汇率') ||
      raw.includes('价格') ||
      raw.includes('牌价') ||
      raw.includes('多少') ||
      raw.toLowerCase().includes('huilv');
    if (card && price) return 'both';
    if (card) return 'card';
    if (price) return 'price';
    return null;
  }

  static parseAskNumber(token) {
    if (/^\d{1,3}(\.\d{3})+$/.test(token) || /^\d{1,3}(,\d{3})+$/.test(token)) {
      if (token.startsWith('0')) return null;
      return Number(token.replace(/[.,]/g, ''));
    }
    if (/^\d+$/.test(token)) {
      if (token.startsWith('0')) return null;
      return Number(token);
    }
    if (/^\d+[.,]\d{1,2}$/.test(token)) return Number(token.replace(',', '.'));
    return null;
  }

  static formatVndAmount(amount) {
    const n = Math.round(Number(amount));
    if (!Number.isFinite(n) || n <= 0) return null;
    const grouped = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${grouped} vnd`;
  }

  /** Số tiền đầu tiên trong câu hỏi. Bỏ dãy số trơn như số tài khoản. */
  static extractAskAmount(text) {
    const raw = String(text || '');
    if (!raw.trim()) return null;
    const number = '(\\d{1,3}(?:\\.\\d{3})+|\\d{1,3}(?:,\\d{3})+|\\d+(?:[.,]\\d{1,2})?)';
    const specs = [
      { re: new RegExp(`${number}\\s*(?:triệu|trieu|tr)(?![\\p{L}\\p{N}])`, 'giu'), mult: 1000000 },
      { re: new RegExp(`${number}\\s*万`, 'gu'), mult: 10000 },
      { re: new RegExp(`${number}\\s*亿`, 'gu'), mult: 100000000 },
      { re: new RegExp(`${number}\\s*(?:vnd|vnđ|vnĐ|đồng|Đồng|dong|đ|Đ)(?![\\p{L}\\p{N}])`, 'giu'), mult: 1 },
      { re: /(\d{1,3}(?:\.\d{3})+|\d{1,3}(?:,\d{3})+)/g, mult: 1 },
    ];
    let best = null;
    for (const spec of specs) {
      spec.re.lastIndex = 0;
      let match = spec.re.exec(raw);
      while (match) {
        const value = Utils.parseAskNumber(match[1]);
        const amount = value == null ? null : value * spec.mult;
        if (amount > 0 && (!best || match.index < best.index || (match.index === best.index && match[0].length > best.length))) {
          best = { index: match.index, length: match[0].length, amount };
        }
        match = spec.re.exec(raw);
      }
    }
    return best ? Utils.formatVndAmount(best.amount) : null;
  }

  static stripVi(text) {
    return String(text || '')
      .replace(/[đĐ]/g, 'd')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase();
  }

  /** 'ok' | 'change' | 'locked' | null. Từ tín hiệu chỉ cần nằm trong câu. Phủ định thì xin thẻ mới. */
  static classifyCardReply(text) {
    const folded = Utils.stripVi(text).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!folded) return null;
    if (/\bkhoa\b/.test(folded)) return 'locked';
    if (/\bdoi\b/.test(folded)) return 'change';
    const raw = String(text || '').toLowerCase();
    const negated = /\bkhong\b|\bko\b/.test(folded)
      || /đừng/.test(raw)
      || (/\bdung\b/.test(folded) && !/dùng/.test(raw));
    if (negated) return 'change';
    return Utils.cardOkSignals().some((pattern) => pattern.test(folded)) ? 'ok' : null;
  }

  static cardOkSignals() {
    return [
      /binh thuong/,
      /\bbthg\b/,
      /\bbth\b/,
      /\bbt\b/,
      /danh vao/,
      /\bdv\b/,
      /\bcon\b/,
      /\bvao\b/,
    ];
  }

  /** 'yes' | 'no' | null. Trả lời câu "thẻ đã test chưa". Phủ định được xét trước. */
  static classifyTestReply(text) {
    const folded = Utils.stripVi(text).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!folded) return null;
    const raw = String(text || '').toLowerCase();
    const no = /đừng/.test(raw)
      || /\bkhong\b|\bko\b|\bchua\b|\bnham\b|\bsai\b|\bdoi\b|\bkhoa\b/.test(folded)
      || (/\bdung\b/.test(folded) && !/dùng/.test(raw) && !/đúng/.test(raw));
    if (no) return 'no';
    const yes = [
      /\broi\b/,
      /\bda test\b/,
      /\btest\b/,
      /\bok\b/,
      /\boke\b/,
      /\bduoc\b/,
      /\bxong\b/,
      ...Utils.cardOkSignals(),
    ];
    if (/đúng/.test(raw) || yes.some((pattern) => pattern.test(folded))) return 'yes';
    return null;
  }

  static matchBankName(foldedText) {
    const rules = [
      [/vietcombank|\bvcb\b/, 'Vietcombank'],
      [/vietinbank|\bvietin\b|\bctg\b/, 'VietinBank'],
      [/\bbidv\b/, 'BIDV'],
      [/agribank/, 'Agribank'],
      [/techcombank|\btcb\b/, 'Techcombank'],
      [/mbbank|mb\s*bank|\bmb\b/, 'MB'],
      [/\bacb\b/, 'ACB'],
      [/vpbank|\bvpb\b/, 'VPBank'],
      [/tpbank|\btpb\b/, 'TPBank'],
      [/sacombank|\bstb\b/, 'Sacombank'],
      [/hdbank|\bhdb\b/, 'HDBank'],
      [/\bmsb\b|maritime/, 'MSB'],
      [/\bshb\b/, 'SHB'],
      [/\bvib\b/, 'VIB'],
      [/\bocb\b/, 'OCB'],
      [/seabank/, 'SeABank'],
      [/eximbank|\beib\b/, 'Eximbank'],
      [/nam\s*a\s*bank|namabank/, 'Nam A Bank'],
      [/lpbank|lien\s*viet/, 'LPBank'],
      [/abbank/, 'ABBank'],
      [/bac\s*a\s*bank|bacabank/, 'Bac A Bank'],
      [/vietabank|\bvab\b/, 'VietABank'],
      [/kienlong|kien\s*long/, 'KienlongBank'],
      [/\bncb\b/, 'NCB'],
      [/pvcombank|pvcom/, 'PVcomBank'],
      [/dong\s*a\s*bank|donga/, 'DongA Bank'],
      [/shinhan/, 'Shinhan'],
      [/hsbc/, 'HSBC'],
    ];
    for (const [pattern, name] of rules) {
      if (pattern.test(foldedText)) return name;
    }
    return '';
  }

  static matchAccountNumber(lines, folded) {
    const label = /(stk|so tk|so tai khoan|tai khoan|账号|帐号)/;
    const pick = (line) => {
      const compact = String(line).replace(/(?<=\d)\s+(?=\d)/g, '');
      const found = compact.match(/\d{6,19}/g);
      if (!found || !found.length) return '';
      return found.sort((a, b) => b.length - a.length)[0];
    };
    for (let i = 0; i < lines.length; i++) {
      if (label.test(folded[i]) || /账号|帐号/.test(lines[i])) {
        const account = pick(lines[i]);
        if (account) return account;
      }
    }
    const loose = [];
    for (const line of lines) {
      const account = pick(line);
      if (account && !/^20\d{6,}$/.test(account)) loose.push(account);
    }
    if (!loose.length) return '';
    const notPhone = loose.find((n) => !(n.length === 10 && n.startsWith('0')));
    return notPhone || loose[0];
  }

  static looksLikeHolderName(value) {
    const name = String(value || '').trim();
    if (name.length < 4 || name.length > 60) return false;
    if (/\d{4,}/.test(name)) return false;
    return /\p{L}/u.test(name);
  }

  static matchAccountHolder(lines, folded) {
    const label = /(chu\s*tk|chu\s*tai\s*khoan|ten\s*chu|ho\s*ten|ho\s*va\s*ten|^ten\b|户名|姓名)/;
    for (let i = 0; i < lines.length; i++) {
      if (!label.test(folded[i]) && !/户名|姓名/.test(lines[i])) continue;
      const after = lines[i].split(/[:：]/).slice(1).join(':').trim();
      if (Utils.looksLikeHolderName(after)) return after;
      if (lines[i + 1] && Utils.looksLikeHolderName(lines[i + 1])) return lines[i + 1].trim();
    }
    for (const line of lines) {
      if (/^[\p{Lu}][\p{Lu}\s'.]{4,}$/u.test(line) && line.includes(' ')) return line.trim();
    }
    return '';
  }

  /** @returns {{ bank: string, account: string, name: string } | null} */
  static parseBankCard(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    const lines = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return null;
    const folded = lines.map((line) => Utils.stripVi(line));
    const bank = Utils.matchBankName(folded.join('\n'));
    const account = Utils.matchAccountNumber(lines, folded);
    const name = Utils.matchAccountHolder(lines, folded);
    if (!bank || !account || !name) return null;
    return { bank, account, name };
  }

  static formatCardCaption(info) {
    return `可以进\n银行：${info.bank}\n账号：${info.account}\n户名：${info.name}`;
  }

  static looksLikeCardText(text) {
    return /\d{6,}/.test(String(text || ''));
  }

  static normalizeExtractedCard(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const bank = String(raw.bank || '').trim();
    const account = String(raw.account || '').replace(/\D/g, '');
    const name = String(raw.name || '').trim();
    if (!bank || !name || !/^\d{6,19}$/.test(account)) return null;
    return { bank, account, name };
  }

  /**
   * Tách thẻ bằng OpenAI. Ảnh gửi kèm dạng data URL.
   * @returns {Promise<{ bank: string, account: string, name: string } | null>}
   */
  static async extractBankCardOpenAI({ apiKey, model, text, imageBuffer, mime }) {
    if (!apiKey) {
      Utils.log('❌ Thiếu OPENAI_API_KEY trong .env');
      return null;
    }
    const instruction = [
      'Trích xuất thông tin tài khoản ngân hàng Việt Nam từ chữ hoặc ảnh.',
      'Chỉ trả JSON với đúng các khóa bank, account, name.',
      'bank là tên ngân hàng. account chỉ gồm chữ số. name là tên chủ tài khoản.',
      'Thiếu mục nào thì để chuỗi rỗng. Không bịa số tài khoản hoặc tên.',
    ].join(' ');
    const parts = [{ type: 'text', text: instruction }];
    const bodyText = String(text || '').trim();
    if (bodyText) parts.push({ type: 'text', text: bodyText });
    if (imageBuffer && imageBuffer.length) {
      const type = mime || 'image/jpeg';
      parts.push({
        type: 'image_url',
        image_url: { url: `data:${type};base64,${imageBuffer.toString('base64')}` },
      });
    }
    if (parts.length === 1) return null;
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(25000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Bạn chỉ trả JSON hợp lệ, không giải thích.' },
            { role: 'user', content: parts },
          ],
        }),
      });
      if (!res.ok) {
        Utils.log(`❌ OpenAI HTTP ${res.status}`);
        return null;
      }
      const data = await res.json();
      let content = data?.choices?.[0]?.message?.content || '';
      content = String(content).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      return Utils.normalizeExtractedCard(JSON.parse(content));
    } catch (error) {
      Utils.log(`❌ OpenAI lỗi: ${error.message}`);
      return null;
    }
  }

  static rateCardSignature(message) {
    const text = message?.message || message?.text || '';
    const digits = String(text).match(/\d{6,}/g);
    if (digits && digits.length) return `stk:${digits.join(',')}`;
    const photoId = message?.photo?.id || message?.media?.photo?.id;
    if (photoId != null) return `photo:${photoId}`;
    const docId = message?.document?.id || message?.media?.document?.id;
    if (docId != null) return `doc:${docId}`;
    return `msg:${message?.id ?? ''}`;
  }

  static rateReplyHasContent(message, text) {
    if (text && String(text).trim()) return true;
    if (!message) return false;
    if (Utils.hasPhoto(message)) return true;
    const media = message.media;
    if (!media) return false;
    const name = media.className || '';
    return name === 'MessageMediaDocument' || name === 'MessageMediaPhoto';
  }

  /** Quảng cáo cột Mua USDT/VND có hạn mức chứa `amount`. null khi không lấy được sổ. */
  static async fetchOkxSellAds(amount = 100000000) {
    const target = Number(amount);
    const url =
      'https://www.okx.com/v3/c2c/tradingOrders/books?quoteCurrency=vnd&baseCurrency=usdt&side=sell&paymentMethod=all&userType=all&showTrade=false&receivingAds=false&showFollow=false&showAlreadyTraded=false&isAbleFilter=false';
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
    });
    if (!res.ok) {
      Utils.log(`❌ OKX HTTP ${res.status}`);
      return null;
    }
    const body = await res.json();
    const sell = body?.data?.sell;
    if (!Array.isArray(sell)) {
      Utils.log('❌ OKX không có sổ cột Mua');
      return null;
    }
    return sell.filter((ad) => {
      const min = Number(ad?.quoteMinAmountPerOrder);
      const max = Number(ad?.quoteMaxAmountPerOrder);
      return Number.isFinite(min) && Number.isFinite(max) && min <= target && max >= target;
    });
  }

  /**
   * Hàng `row` (mặc định 5) trên cột Mua USDT/VND, hạn mức chứa `amount`, cộng `markup`.
   * @returns {Promise<string>} `汇率：…` hoặc RATE_UNAVAILABLE
   */
  static async fetchOkxHuilv({ amount = 100000000, row = 5, markup = 230 } = {}) {
    const target = Number(amount);
    const want = Number(row);
    const extra = Number(markup);
    try {
      const fit = await Utils.fetchOkxSellAds(target);
      if (!Array.isArray(fit)) return Utils.RATE_UNAVAILABLE;
      if (!Number.isInteger(want) || want < 1 || fit.length < want) {
        Utils.log(`❌ OKX cột Mua mốc ${target} chỉ có ${fit.length} hàng, cần hàng ${want}`);
        return Utils.RATE_UNAVAILABLE;
      }
      const price = Number(fit[want - 1].price);
      if (!Number.isFinite(price)) return Utils.RATE_UNAVAILABLE;
      const quoted = Math.round(price) + (Number.isFinite(extra) ? extra : 0);
      return `汇率：${quoted}`;
    } catch (error) {
      Utils.log(`❌ OKX lỗi: ${error.message}`);
      return Utils.RATE_UNAVAILABLE;
    }
  }

  /** Bỏ `skip` thương nhân đầu, liệt kê `count` giá tiếp theo. null khi lỗi mạng. */
  static async listOkxMerchants({ amount = 100000000, skip = 1, count = 10 } = {}) {
    const fit = await Utils.fetchOkxSellAds(amount);
    if (!Array.isArray(fit)) return null;
    return Utils.formatP2pMerchantList('OKX', fit.map((ad) => ({
      price: ad?.price,
      nick: ad?.nickName,
    })), { skip, count });
  }

  static coversFiatAmount(min, max, amount) {
    return Number.isFinite(min) && Number.isFinite(max) && min <= amount && max >= amount;
  }

  static async fetchBinanceBuyAds(amount = 100000000) {
    const target = Number(amount);
    const url = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
    const collected = [];
    for (let page = 1; page <= 3 && collected.length < 11; page += 1) {
      const res = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(12000),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
        body: JSON.stringify({
          asset: 'USDT',
          fiat: 'VND',
          merchantCheck: false,
          page,
          payTypes: [],
          publisherType: null,
          rows: 20,
          tradeType: 'BUY',
          transAmount: String(target),
        }),
      });
      if (!res.ok) {
        Utils.log(`❌ Binance HTTP ${res.status}`);
        return null;
      }
      const body = await res.json();
      if (body?.code !== '000000' || !Array.isArray(body.data)) {
        Utils.log('❌ Binance không có sổ cột Mua');
        return null;
      }
      for (const row of body.data) {
        const adv = row?.adv || {};
        const min = Number(adv.minSingleTransAmount);
        const hardMax = Number(adv.maxSingleTransAmount);
        const dynamic = Number(adv.dynamicMaxSingleTransAmount);
        const max = Number.isFinite(dynamic) && dynamic > 0 ? Math.min(hardMax, dynamic) : hardMax;
        if (!Utils.coversFiatAmount(min, max, target)) continue;
        collected.push({ price: adv.price, nick: row?.advertiser?.nickName });
      }
      if (body.data.length < 20) break;
    }
    return collected;
  }

  static async fetchBybitBuyAds(amount = 100000000) {
    const target = Number(amount);
    const url = 'https://api2.bybit.com/fiat/otc/item/online';
    const collected = [];
    for (let page = 1; page <= 3 && collected.length < 11; page += 1) {
      const res = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(12000),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
        body: JSON.stringify({
          userId: '',
          tokenId: 'USDT',
          currencyId: 'VND',
          payment: [],
          side: '1',
          size: '20',
          page: String(page),
          amount: String(target),
          authMaker: false,
          canTrade: false,
        }),
      });
      if (!res.ok) {
        Utils.log(`❌ Bybit HTTP ${res.status}`);
        return null;
      }
      const body = await res.json();
      const items = body?.result?.items;
      if (body?.ret_code !== 0 || !Array.isArray(items)) {
        Utils.log('❌ Bybit không có sổ cột Mua');
        return null;
      }
      for (const ad of items) {
        const min = Number(ad?.minAmount);
        const max = Number(ad?.maxAmount);
        if (!Utils.coversFiatAmount(min, max, target)) continue;
        collected.push({ price: ad?.price, nick: ad?.nickName });
      }
      if (items.length < 20) break;
    }
    return collected;
  }

  static async listBinanceMerchants({ amount = 100000000, skip = 1, count = 10 } = {}) {
    const fit = await Utils.fetchBinanceBuyAds(amount);
    if (!Array.isArray(fit)) return null;
    return Utils.formatP2pMerchantList('Binance', fit, { skip, count });
  }

  static async listBybitMerchants({ amount = 100000000, skip = 1, count = 10 } = {}) {
    const fit = await Utils.fetchBybitBuyAds(amount);
    if (!Array.isArray(fit)) return null;
    return Utils.formatP2pMerchantList('Bybit', fit, { skip, count });
  }

  static formatP2pMerchantList(exchange, ads, { skip = 1, count = 10 } = {}) {
    const start = Math.max(0, Number(skip) || 0);
    const take = Math.max(0, Number(count) || 0);
    const rows = ads.slice(start, start + take);
    const lines = rows.map((ad, index) => {
      const price = Number(ad?.price);
      const shown = Number.isFinite(price) ? String(Math.round(price)) : '?';
      const nick = String(ad?.nick || 'không tên').replace(/\s+/g, ' ').trim().slice(0, 40);
      return `${start + index + 1}. ${shown} — ${nick}`;
    });
    const header = `${exchange} cột Mua USDT/VND, mốc 100 triệu. Bỏ thương nhân đầu, ${take} người tiếp theo:`;
    if (!lines.length) return `${header}\nKhông còn thương nhân sau người đầu.`;
    const short = lines.length < take ? `\nChỉ còn ${lines.length} thương nhân sau người đầu.` : '';
    return `${header}\n${lines.join('\n')}${short}`;
  }
}

module.exports = Utils; 