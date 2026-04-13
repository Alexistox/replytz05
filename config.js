module.exports = {
  // Telegram API credentials (https://my.telegram.org/apps)
  // Docker: đặt TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_PHONE_NUMBER trong docker-compose.yml
  apiId: process.env.TELEGRAM_API_ID || '22561984',
  apiHash: process.env.TELEGRAM_API_HASH || '83cbfa9fbc70d63535f7ed0959431e29',
  phoneNumber: process.env.TELEGRAM_PHONE_NUMBER || '+84522982414',

  // File lưu session sau đăng nhập (ưu tiên đọc file này nếu có). Docker: có thể TELEGRAM_SESSION_FILE
  sessionFile: process.env.TELEGRAM_SESSION_FILE || './telegram.session',

  // Session string (dự phòng / đồng bộ; bot tự ghi file + config.js sau login)
sessionString: "1BQANOTEuMTA4LjU2LjE2NQG7v6KNQUQvHl6FIvo1JYG9o5Idgwfg2B08PXfIToI5bBPQ/dUmPM9ZqVBHDBKBDtOK4r0AGyem6/N3rLfkXDXu7t5VNuTwc6yTY1BbLFzo2EO4U81bndUvtIjSSWGxarnI941g0SJVDsS21RcibNnxxd4IeAqFEDurCeRoSHKAsTk16HQN4KDkhY7+l+1iwY6y/H5xKVf8FwE2npPk9KquXJrCB3j3LYRFbnLO+Oc0LmI0m5nzjPuJvDb2/I9KCS0lW9NFp3SBc4udfYUpLQzAKZwBD0P6+ktM+CDjvaqNIqFSrkS6iTW+8PIFah7C+dA8B/d5AC28njOhM7eGG4IlNw==",

  // Settings file path
  settingsFile: './settings.json',

  // /copyall & /newcopy: giới hạn mỗi lần chạy (tăng càng cao càng dễ FLOOD_WAIT / chậm)
  copyAllMaxCollect: parseInt(process.env.COPYALL_MAX_COLLECT || '5000', 10),
  copyAllMaxCopy: parseInt(process.env.COPYALL_MAX_COPY || '5000', 10),

  // Default settings
  defaultSettings: {
    replyMessage: '1', // Tin nhắn reply
    groupSettings: {}, // Settings reply theo từng group: { [groupId]: { replyEnabled: boolean } }
    pic2Settings: {}, // Pic2: { [groupId]: [ { id, enabled, targetUser, replyMessage }, ... ] }
    forwardRules: [], // Rules cho auto forward: { sourceGroupId, destGroupId, trigger, createdBy, createdTime, status }
    copyAllWatermark: {}, // /copyall & /newcopy: { "sourceId_destId": lastMessageId }
    adminUsers: [] // Danh sách user IDs có quyền admin: [userId1, userId2, ...]
  }
}; 