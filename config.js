module.exports = {
  // Telegram API credentials
  // Bạn cần lấy từ https://my.telegram.org/apps
  apiId: '25823433',
  apiHash: '20c9bc10247bc3c02db404144f1bad06',
  
  // Số điện thoại Telegram (với mã quốc gia)
  // Ví dụ: '+84901234567'
  phoneNumber: '+855768997652',
  
  // Session string (sẽ được tạo tự động)
  sessionString: '',
  
  // Settings file path
  settingsFile: './settings.json',
  
  // Default settings
  defaultSettings: {
    replyEnabled: false, // Mặc định tắt
    targetChats: [], // Danh sách chat để monitor (để trống = tất cả)
    replyMessage: '1' // Tin nhắn reply
  }
}; 