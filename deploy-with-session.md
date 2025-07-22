# 🔄 Deploy Bot với Session File

## Phương pháp: Copy session từ local lên server

### **Bước 1: Login ở local trước**
```bash
# Trên máy local
cd C:\Users\LENOVO\App-bot\Reply

# Chạy bot để login (nếu chưa)
npm start
# Nhập OTP, 2FA...
# Sau khi login thành công, Ctrl+C để dừng
```

### **Bước 2: Kiểm tra session files**
```bash
# List session files
ls *.session*

# Sẽ thấy files như:
# 1234567890.session
# 1234567890.session-journal
```

### **Bước 3: Upload lên server**
```bash
# Scp session files lên server
scp *.session* user@your-server:~/reply01/

# Hoặc dùng FileZilla, WinSCP...
# Upload cả folder project lên server
```

### **Bước 4: Setup trên server**
```bash
# SSH vào server
ssh user@your-server

# Navigate to bot directory
cd ~/reply01

# Install dependencies
npm install

# Start với PM2 (session đã có sẵn)
pm2 start index.js --name "bank-bot"
pm2 save
pm2 startup
```

## ✅ **Ưu điểm:**
- Không cần nhập OTP trên server
- Nhanh chóng, tiện lợi
- Session được tạo sẵn

## ⚠️ **Lưu ý:**
- Session file chứa thông tin nhạy cảm
- Chỉ copy từ máy tin cậy
- Đảm bảo server bảo mật 