# 🤖 Bank Transaction UserBot

UserBot Telegram tự động phát hiện và reply tin nhắn giao dịch ngân hàng bằng số "1".

> 🚀 **Setup nhanh:** Xem [SETUP.md](./SETUP.md) để cài đặt trong 2-3 phút!

## ✨ Tính năng

- 🔍 **Tự động phát hiện tin nhắn giao dịch** với định dạng:
  ```
  

- 💬 **Tự động reply** bằng số "1" khi phát hiện tin nhắn giao dịch
  - 👥 Reply tin nhắn từ **người khác**
  - 🤖 Reply tin nhắn từ **chính UserBot**
- ⚙️ **Bật/tắt linh hoạt** bằng lệnh `/1 on` và `/1 off`
- 📊 **Theo dõi trạng thái** với các lệnh tiện ích
- 🚫 **Chống spam**: Không reply trùng lặp cho cùng một tin nhắn

## 🚀 Cài đặt

### 1. Clone project
```bash
git clone <repository-url>
cd bank-transaction-userbot
```

### 2. Cài đặt dependencies
```bash
npm install
```

### 3. Cấu hình Telegram

1. **Lấy API credentials:**
   - Truy cập https://my.telegram.org/apps
   - Đăng nhập bằng số điện thoại Telegram
   - Tạo ứng dụng mới để lấy `api_id` và `api_hash`

2. **Cập nhật file `config.js`:**

```javascript
module.exports = {
  apiId: '1234567',                    // Thay bằng API ID của bạn
  apiHash: 'abc123def456ghi789',       // Thay bằng API Hash của bạn
  phoneNumber: '+84901234567',         // Thay bằng SĐT Telegram của bạn
  // ... các cấu hình khác
};
```

**⚠️ Lưu ý:**
- `phoneNumber` phải có dấu `+` và mã quốc gia (VD: `+84` cho Việt Nam)
- Đây là số điện thoại đã đăng ký Telegram

### 4. Chạy UserBot

#### 🪟 Windows:
```bash
# Login lần đầu (nhập OTP một lần)
first-login.bat

# Chạy 24/7 (không cần OTP nữa)
run-24-7.bat
```

#### 🐧 Linux:
```bash
# Cho phép thực thi scripts
chmod +x *.sh

# Login lần đầu (nhập OTP một lần)  
./first-login.sh

# Chạy 24/7 (không cần OTP nữa)
./run-24-7.sh
```

#### ⚡ NPM Scripts (đa nền tảng):
```bash
# Windows
npm run first-login
npm run run-24-7

# Linux
npm run linux:first-login
npm run linux:run-24-7
```

**Lần đầu chạy, bạn sẽ cần:**
- ~~Nhập số điện thoại~~ (đã lưu trong config)
- Nhập mã xác nhận từ Telegram
- Nhập mật khẩu 2FA (nếu có)

**💡 Lưu ý:** Từ lần thứ 2 trở đi, bot sẽ tự động đăng nhập mà không cần nhập gì!

📋 **Hướng dẫn Linux đầy đủ**: Xem [LINUX-SETUP.md](LINUX-SETUP.md)

## 📱 Sử dụng

### Commands chính

| Lệnh | Mô tả |
|------|-------|
| `/1 on` | Bật chức năng reply tự động |
| `/1 off` | Tắt chức năng reply tự động |
| `/1` | Xem trạng thái hiện tại |
| `/status` | Xem thông tin chi tiết bot |
| `/help` | Hiển thị hướng dẫn |

### Cách hoạt động

1. **Bật bot**: Gõ `/1 on` trong bất kỳ chat nào (chính bạn cũng có thể dùng)
2. **Gửi tin nhắn giao dịch**: Bot sẽ tự động phát hiện và reply với "1"
   - ✅ Reply tin nhắn giao dịch từ người khác
   - ✅ **Reply cả tin nhắn giao dịch từ chính bạn**
3. **Tắt bot**: Gõ `/1 off` khi muốn dừng
4. **Kiểm tra trạng thái**: Gõ `/status` để xem tình trạng bot

### Ví dụ tin nhắn được phát hiện

✅ **TIN NHẮN SẼ ĐƯỢC REPLY:**
```
Tiền vào: +50,000 đ
Tài khoản: 20918031 tại ACB
Lúc: 2025-01-20 14:30:15
Nội dung CK: TRAN VAN NAM chuyen tien
```

❌ **TIN NHẮN SẼ KHÔNG ĐƯỢC REPLY:**
```
Chuyển tiền thành công +50,000 đ
```
(Thiếu thông tin tài khoản, thời gian, nội dung CK)

## ⚙️ Cấu hình nâng cao

### Tùy chỉnh tin nhắn reply

Mở file `config.js`:
```javascript
defaultSettings: {
  replyEnabled: false,
  targetChats: [],
  replyMessage: '1'  // Thay đổi tin nhắn reply tại đây
}
```

### Các lệnh khác

```bash
# Chạy ở chế độ phát triển (auto-restart)
npm run dev

# Chạy test các chức năng
npm test

# Test duplicate prevention (nâng cao)
npm run test-duplicate

# Dừng bot đang chạy
## Windows:
npm run stop        # hoặc stop.bat

## Linux:  
npm run linux:stop  # hoặc ./stop.sh

# Push code lên GitHub
## Windows:
npm run push        # hoặc push.bat

## Linux:
npm run linux:push  # hoặc ./push.sh
```

## 🔧 Cấu trúc project

```
bank-transaction-userbot/
├── index.js            # File chính - logic userbot
├── config.js           # Cấu hình API và settings  
├── utils.js            # Các hàm tiện ích
├── package.json        # Dependencies và scripts
├── 🪟 Windows Scripts:
│   ├── first-login.bat   # Setup lần đầu (Windows)
│   ├── run-24-7.bat     # Chạy 24/7 (Windows)
│   ├── run.bat          # Khởi chạy nhanh (Windows)
│   ├── stop.bat         # Dừng bot (Windows)
│   └── push.bat         # Push GitHub (Windows)
├── 🐧 Linux Scripts:
│   ├── first-login.sh   # Setup lần đầu (Linux)
│   ├── run-24-7.sh      # Chạy 24/7 (Linux)
│   ├── run.sh           # Khởi chạy nhanh (Linux)
│   ├── stop.sh          # Dừng bot (Linux)
│   └── push.sh          # Push GitHub (Linux)
├── 📚 Documentation:
│   ├── README.md        # Hướng dẫn chính
│   ├── LINUX-SETUP.md  # Hướng dẫn Linux chi tiết
│   ├── 24-7-GUIDE.md   # Hướng dẫn chạy 24/7
│   ├── server-setup.md # Deploy server nâng cao
│   └── deploy-with-session.md # Deploy bằng session
├── test.js             # File test các chức năng
├── test-duplicate.js   # Test duplicate prevention
├── ecosystem.config.js # PM2 production config
├── settings.json       # Settings runtime (tự tạo)
├── bot.pid             # Process ID (tự tạo khi chạy)
└── .gitignore          # Git ignore patterns
```

## ❗ Lưu ý quan trọng

- ⚠️ **Session bảo mật**: Session string sẽ được tạo tự động, giữ bảo mật
- 🔄 **Tự động khởi động lại**: Bot sẽ tự động kết nối lại nếu mất kết nối
- 📝 **Log chi tiết**: Mọi hoạt động đều được ghi log với timestamp
- 🛡️ **An toàn**: Bot chỉ reply, không thực hiện hành động nguy hiểm nào khác
- 🚫 **Single instance**: Bot chỉ cho phép 1 instance chạy cùng lúc
- ⚡ **Chống duplicate**: Bot không bao giờ reply trùng lặp cho cùng một tin nhắn

## 🔧 Troubleshooting

### Vấn đề: Bot reply 2 lần

**✅ Đã khắc phục trong phiên bản này!**

Nếu vẫn gặp vấn đề:

1. **Dừng tất cả instances cũ:**
   ```bash
   npm run stop
   # hoặc
   stop.bat
   ```

2. **Chạy lại bot:**
   ```bash
   run.bat
   ```

3. **Kiểm tra logs:** Bot sẽ hiển thị:
   ```
   🔄 Duplicate protection: ACTIVE
   📊 Process ID: 1234
   ```

4. **Test duplicate prevention:**
   ```bash
   npm run test-duplicate
   ```

### Vấn đề: Bot không reply tin nhắn từ chính mình

**✅ Đã khắc phục! Bot giờ reply cả tin nhắn giao dịch từ chính UserBot.**

## 🐛 Debug

### Kiểm tra log
Bot sẽ hiển thị log chi tiết trong console:
```
[20/01/2025 14:30:15] 🤖 Bank Transaction Userbot khởi tạo
[20/01/2025 14:30:16] ✅ Kết nối thành công!
[20/01/2025 14:30:17] 💰 Phát hiện giao dịch: +50,000đ từ ACB - 20918031
[20/01/2025 14:30:17] ✅ Đã reply tin nhắn giao dịch với: "1"
```

### Các lỗi phổ biến

1. **API credentials không đúng**: Kiểm tra lại `api_id` và `api_hash`
2. **Không phát hiện tin nhắn**: Đảm bảo tin nhắn có đủ 4 thông tin bắt buộc
3. **Không thể reply**: Kiểm tra quyền gửi tin nhắn trong chat đó

## 📞 Hỗ trợ

- 📖 Đọc kỹ hướng dẫn trước khi sử dụng
- 🔍 Kiểm tra log để debug
- ⚙️ Sử dụng `/status` để kiểm tra trạng thái bot

---

🎯 **Mục tiêu**: Tự động hóa việc reply tin nhắn giao dịch ngân hàng một cách nhanh chóng và chính xác! 
