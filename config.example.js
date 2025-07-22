module.exports = {
  // Telegram API credentials
  // 📚 Hướng dẫn lấy API credentials:
  // 1. Truy cập: https://my.telegram.org/apps
  // 2. Đăng nhập bằng số điện thoại Telegram
  // 3. Tạo ứng dụng mới
  // 4. Copy api_id và api_hash vào đây
  apiId: 'YOUR_API_ID',        // Ví dụ: 1234567
  apiHash: 'YOUR_API_HASH',    // Ví dụ: 'abcd1234efgh5678ijkl9012mnop3456'
  
  // Số điện thoại Telegram (với mã quốc gia)
  // ⚠️  Quan trọng: Phải có dấu '+' và mã quốc gia
  phoneNumber: 'YOUR_PHONE_NUMBER',  // Ví dụ: '+84901234567'
  
  // Session string (sẽ được tạo tự động sau lần đăng nhập đầu tiên)
  sessionString: '',
  
  // Đường dẫn file settings
  settingsFile: './settings.json',
  
  // Cấu hình mặc định
  defaultSettings: {
    replyEnabled: false,        // Mặc định TẮT chức năng reply
    targetChats: [],           // Danh sách chat ID cần monitor (để trống = tất cả)
    replyMessage: '1',         // Tin nhắn reply (có thể thay đổi)
    
    // Tùy chọn nâng cao
    replyDelay: 0,             // Delay trước khi reply (ms)
    logLevel: 'info',          // Level log: 'debug', 'info', 'warn', 'error'
    maxRetries: 3,             // Số lần retry khi lỗi
  }
}; 