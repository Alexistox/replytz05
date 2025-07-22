module.exports = {
  // Telegram API credentials
  // Bạn cần lấy từ https://my.telegram.org/apps
  apiId: '13656730',
  apiHash: '4d9d6a0e9ff0548c33417d651ca5150e',
 
  phoneNumber: '+8801876973955',
  
  // Session string (sẽ được tạo tự động)
  sessionString: '1BQANOTEuMTA4LjU2LjE0MwG7UBZ1bPRyNCozH9Zg2si0g3oEJgRGNCbFtnQiaVZFGzE0KFzhKlMS37xEiuZAvln7d76Os9B/l0nmiU2AHL8HiXQLp+6Ib27uhvb/XWIHBvMus+CwGYhEcBpv1V3dSvK/LTuMFbnn36yJ79wWI/wtSEqyuvEPaU4zNqwRg9NZo0ehFzh9GjH5ir8igaljDaJiVlzOttdjFNY62NNizP3sQ8WG0uW3qA72fqyHzgetfpgQ/ne9uvkFb4UQf0sK8mQNxesRg9s6dMlM8yAofyj/InjcbnzGiFuvdnzg/d5+d0dGdUpLcEWpaE9lDGaU+T9DCvLPM7/aJLYjN18Ih0I5JQ==',
  
  // Settings file path
  settingsFile: './settings.json',
  
  // Default settings
  defaultSettings: {
    replyEnabled: false, // Mặc định tắt
    targetChats: [], // Danh sách chat để monitor (để trống = tất cả)
    replyMessage: '1' // Tin nhắn reply
  }
}; 