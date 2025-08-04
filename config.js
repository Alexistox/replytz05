module.exports = {
  // Telegram API credentials
  // Bạn cần lấy từ https://my.telegram.org/apps
  apiId: '20074882',
  apiHash: 'a050e624a7696df857f053849892f82b',
 
  phoneNumber: '+18633202397',
  
  // Session string (sẽ được tạo tự động)
  sessionString: '',
  
  // Settings file path
  settingsFile: './settings.json',
  
  // Default settings
  defaultSettings: {
    replyMessage: '1', // Tin nhắn reply
    groupSettings: {}, // Settings reply theo từng group: { [groupId]: { replyEnabled: boolean } }
    pic2Settings: {}, // Settings cho tính năng pic2 theo từng group
    forwardRules: [], // Rules cho auto forward: { sourceGroupId, destGroupId, trigger, createdBy, createdTime, status }
    adminUsers: [] // Danh sách user IDs có quyền admin: [userId1, userId2, ...]
  }
}; 