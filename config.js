module.exports = {
  // Telegram API credentials
  // Bạn cần lấy từ https://my.telegram.org/apps
  apiId: '25823433',
  apiHash: '20c9bc10247bc3c02db404144f1bad06',
  
  // Số điện thoại Telegram (với mã quốc gia)
  // Ví dụ: '+84901234567'
  phoneNumber: '+855768997652',

  
  // Session string (sẽ được tạo tự động)
  sessionString: '1BQANOTEuMTA4LjU2LjE0MwG7UBZ1bPRyNCozH9Zg2si0g3oEJgRGNCbFtnQiaVZFGzE0KFzhKlMS37xEiuZAvln7d76Os9B/l0nmiU2AHL8HiXQLp+6Ib27uhvb/XWIHBvMus+CwGYhEcBpv1V3dSvK/LTuMFbnn36yJ79wWI/wtSEqyuvEPaU4zNqwRg9NZo0ehFzh9GjH5ir8igaljDaJiVlzOttdjFNY62NNizP3sQ8WG0uW3qA72fqyHzgetfpgQ/ne9uvkFb4UQf0sK8mQNxesRg9s6dMlM8yAofyj/InjcbnzGiFuvdnzg/d5+d0dGdUpLcEWpaE9lDGaU+T9DCvLPM7/aJLYjN18Ih0I5JQ==',
  
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