module.exports = {
  // Telegram API credentials
  // Bạn cần lấy từ https://my.telegram.org/apps
  apiId: '20074882',
  apiHash: 'a050e624a7696df857f053849892f82b',
 
  phoneNumber: '+18633202397',
  
  // Session string (sẽ được tạo tự động)
  sessionString: '1BQANOTEuMTA4LjU2LjE0MwG7ASAEru0JJSFmWHfKKpOEj3pPCh2LhPhpzRyrOz7Tu+7yIewuJDvzSvVKjPotBXdHZcjPUzJlweICw+Bd5/mjJvg1y5K3rmQBLx5FeHc3+6ggKNtTmUQ555V7/ntiafwjUQKmYPHOikV84h01FM/Bbpjzo+vC4WjZxuyPAbVGYgNWtUtroKUQB2DHdE9595bBUxa0C+aCOMI5cSu6rNukyDlIA6tA3EfekmIwAbGYA/3B4FeJ6JTneKCqZmaOCAaW/ZWznVXCwVQ1nTb1UnJlyAf4zIXN7Ww+XKjhwawV6HNFdDeIarbZA23wx83igz3DvehErr37VhbNoPlTJsBV2A==',
  
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