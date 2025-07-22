module.exports = {
  // Telegram API credentials
  // Bạn cần lấy từ https://my.telegram.org/apps
  apiId: '13656730',
  apiHash: '4d9d6a0e9ff0548c33417d651ca5150e',
 
  phoneNumber: '+8801876973955',
  
  // Session string (sẽ được tạo tự động)
  sessionString: '',
  
  // Settings file path
  settingsFile: './settings.json',
  
  // Default settings
  defaultSettings: {
    replyEnabled: false, // Mặc định tắt
    targetChats: [], // Danh sách chat để monitor (để trống = tất cả)
    replyMessage: '1', // Tin nhắn reply
    pic2Settings: {} // Settings cho tính năng pic2 theo từng group
  }
}; 