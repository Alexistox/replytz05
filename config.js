require('dotenv').config({ quiet: true });

function envList(name) {
  return (process.env[name] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = {
  // Telegram API credentials (https://my.telegram.org/apps) — điền trong file .env
  apiId: process.env.TELEGRAM_API_ID || '',
  apiHash: process.env.TELEGRAM_API_HASH || '',
  phoneNumber: process.env.TELEGRAM_PHONE_NUMBER || '',

  // File lưu session sau đăng nhập (ưu tiên đọc file này nếu có). Có thể đổi bằng TELEGRAM_SESSION_FILE
  sessionFile: process.env.TELEGRAM_SESSION_FILE || './telegram.session',

  // Session string (dự phòng). Ưu tiên file telegram.session; có thể đặt TELEGRAM_SESSION_STRING trong .env
  sessionString: process.env.TELEGRAM_SESSION_STRING || '',

  // Settings file path
  settingsFile: './settings.json',

  // /copyall & /newcopy: giới hạn mỗi lần chạy (tăng càng cao càng dễ FLOOD_WAIT / chậm)
  copyAllMaxCollect: parseInt(process.env.COPYALL_MAX_COLLECT || '5000', 10),
  copyAllMaxCopy: parseInt(process.env.COPYALL_MAX_COPY || '5000', 10),
  // /bdl & /bdls: tối đa số id mỗi lần — env BDL_MAX_RANGE (mặc định 200, đọc qua Utils.getBdlMaxRange)

  /** User ID Telegram luôn có quyền admin (không thể gỡ bằng /adremove). .env: PERMANENT_ADMIN_USER_IDS */
  permanentAdminUserIds: envList('PERMANENT_ADMIN_USER_IDS'),

  // Default settings
  defaultSettings: {
    replyMessage: '1', // Tin nhắn reply
    calEnabled: false, // /cal on|on admin|off (admin) — toàn bot, mọi nhóm/chat
    calAdminOnly: false, // khi true: chỉ admin mới gửi biểu thức được tính (cần /cal on admin)
    groupSettings: {}, // Mỗi nhóm: { replyEnabled }
    pic2Settings: {}, // Pic2: { [groupId]: [ { id, enabled, targetUser, replyMessage }, ... ] }
    forwardRules: [], // Rules cho auto forward: { sourceGroupId, destGroupId, trigger, createdBy, createdTime, status }
    mirrorTriggers: {}, // Mirror 1/2/3: { [groupBId]: [userId, ...] } — chỉ user trong list mới mirror về A
    copyAllWatermark: {}, // /copyall & /newcopy: { "sourceId_destId": lastMessageId }
    adminUsers: [] // Danh sách user IDs có quyền admin: [userId1, userId2, ...]
  }
}; 
