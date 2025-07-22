# 🔄 Hướng dẫn chạy Bot 24/7 - KHÔNG CẦN OTP

## ⚡ Setup nhanh (chỉ 1 lần)

### **Bước 1: Cấu hình lần đầu**
```bash
# 1. Sửa config.js
# - apiId: từ my.telegram.org/apps  
# - apiHash: từ my.telegram.org/apps
# - phoneNumber: số điện thoại Telegram của bạn

# 2. Login lần đầu (cần OTP/2FA)
first-login.bat
# hoặc: npm run first-login
```

**Điều gì sẽ xảy ra:**
- ✅ Bot yêu cầu OTP từ Telegram
- ✅ Bot yêu cầu 2FA (nếu có)
- ✅ **Session tự động lưu vào config.js**
- ✅ Lần sau không cần OTP/2FA nữa!

### **Bước 2: Chạy 24/7 (mọi lần sau)**
```bash
# Chạy bot 24/7 - KHÔNG CẦN OTP
run-24-7.bat
# hoặc: npm run run-24-7
```

**Điều gì sẽ xảy ra:**
- ✅ Bot tự động login bằng session
- ✅ Không hỏi OTP/2FA
- ✅ Chạy liên tục cho đến khi dừng
- ✅ Single instance protection

## 🛑 Dừng bot
```bash
# Dừng an toàn
stop.bat
# hoặc: npm run stop
# hoặc: Ctrl+C trong cửa sổ console
```

## 🔧 Troubleshooting

### **Vấn đề: Vẫn hỏi OTP mỗi lần**
```bash
# Kiểm tra session trong config.js
# Phải thấy: sessionString: '1BVtsO...' (rất dài)
# Nếu vẫn là: sessionString: ''
# → Chạy lại: first-login.bat
```

### **Vấn đề: "Session expired"**  
```bash
# Xóa session và login lại
# Sửa config.js: sessionString: ''
# Chạy: first-login.bat
```

### **Vấn đề: "Bot khác đang chạy"**
```bash
# Dừng bot cũ trước
stop.bat
# Rồi chạy lại
run-24-7.bat
```

## 📊 Monitoring

### **Kiểm tra bot đang chạy:**
```bash
# Windows
tasklist | findstr node

# Check PID file
type bot.pid
```

### **Xem trạng thái:**
- Gửi `/status` trong Telegram
- Gửi `/help` để test bot

## 🎯 **Kết quả mong đợi:**

### **✅ Sau first-login.bat:**
```
✅ Session đã được lưu vào config.js
🔄 Giờ bạn có thể chạy bot 24/7 với: run-24-7.bat
```

### **✅ Sau run-24-7.bat:**  
```
🔑 Sử dụng session có sẵn - không cần OTP/2FA
✅ UserBot đã sẵn sàng hoạt động!
🔄 Duplicate protection: ACTIVE
📊 Process ID: 1234
```

## 🚀 **Production Deployment**

Để chạy trên server 24/7:
1. Upload code lên server
2. Chạy `first-login.bat` **trên local** (để nhập OTP)  
3. Copy `config.js` (có session) lên server
4. Chạy `run-24-7.bat` trên server

---
🎯 **Mục tiêu:** Bot chạy 24/7 mà không cần can thiệp thủ công! 