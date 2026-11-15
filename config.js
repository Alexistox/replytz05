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

  // Tách thông tin thẻ. .env: OPENAI_API_KEY, tùy chọn OPENAI_MODEL
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',

  // AI chat (ý 1: auto-reply theo chat, mặc định TẮT — bật bằng /ai on)
  // AI_PROVIDER=openai|claude|grok
  aiProvider: process.env.AI_PROVIDER || 'openai',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  xaiApiKey: process.env.XAI_API_KEY || '',
  aiModel: process.env.AI_MODEL || '',
  aiSystemPrompt:
    process.env.AI_SYSTEM_PROMPT ||
    'Bạn là trợ lý ngắn gọn trên Telegram. Trả lời bằng tiếng Việt trừ khi người dùng dùng ngôn ngữ khác. Không bịa số liệu.',
  aiMaxHistory: parseInt(process.env.AI_MAX_HISTORY || '12', 10),

  // Control API (ý 2: Cursor/Claude/Grok điều khiển userbot qua HTTP localhost)
  // Bắt buộc CONTROL_API_TOKEN mới lắng nghe. Chỉ bind 127.0.0.1 mặc định.
  controlApiHost: process.env.CONTROL_API_HOST || '127.0.0.1',
  controlApiPort: parseInt(process.env.CONTROL_API_PORT || '3847', 10),
  controlApiToken: process.env.CONTROL_API_TOKEN || '',

  // Claude Code pilot (Telegram /cc → claude CLI trên VPS → control-cli)
  // CLAUDE_CODE_ENABLED=0 để tắt. Cần: npm i -g @anthropic-ai/claude-code && claude auth login
  claudeCodeEnabled: process.env.CLAUDE_CODE_ENABLED !== '0',
  claudeCodeBin: process.env.CLAUDE_CODE_BIN || '',
  claudeCodeTimeoutMs: parseInt(process.env.CLAUDE_CODE_TIMEOUT_MS || '180000', 10),
  claudeCodeSystemPrompt: process.env.CLAUDE_CODE_SYSTEM_PROMPT || '',

  /** User ID Telegram luôn có quyền admin (không thể gỡ bằng /adremove). .env: PERMANENT_ADMIN_USER_IDS */
  permanentAdminUserIds: envList('PERMANENT_ADMIN_USER_IDS'),

  // Default settings
  defaultSettings: {
    // workflow.wf1BotPeer / wf2BotPeer / wf3BotPeer — mỗi WF một bot
    replyMessage: '1', // Tin nhắn reply
    calEnabled: false, // /cal on|on admin|off (admin) — toàn bot, mọi nhóm/chat
    copyPolicyEnabled: true, // /policy on|off — lọc QC/cờ bạc khi copy và setforward
    calAdminOnly: false, // khi true: chỉ admin mới gửi biểu thức được tính (cần /cal on admin)
    workflow: {}, // { wf1BotPeer, wf2BotPeer, wf3BotPeer, wfBotPeer? (legacy→wf1) }
    groupSettings: {}, // Mỗi nhóm: { replyEnabled, aiEnabled?, aiPrompt?, claudeCodePilot? }
    aiProvider: null, // override runtime: openai|claude|grok (null = dùng env)
    aiModel: null,
    pic2Settings: {}, // Pic2: { [groupId]: [ { id, enabled, targetUser, replyMessage }, ... ] }
    forwardRules: [], // Rules cho auto forward: { sourceGroupId, destGroupId, trigger, createdBy, createdTime, status }
    mirrorTriggers: {}, // Mirror 1/2/3: { [groupBId]: [userId, ...] } — chỉ user trong list mới mirror về A
    copyAllWatermark: {}, // /copyall & /newcopy: { "sourceId_destId": lastMessageId }
    adminUsers: [], // Danh sách user IDs có quyền admin: [userId1, userId2, ...]
    rateDesk: {
      priceEnabled: true,
      markup: 230,
      amount: 100000000,
      row: 5,
      desks: {},
      customers: {}
    }
  }
}; 
