# ⚡ Hướng dẫn Setup Nhanh

## 🔧 Bước 1: Lấy API credentials

1. **Truy cập:** https://my.telegram.org/apps
2. **Đăng nhập** bằng số điện thoại Telegram của bạn
3. **Tạo ứng dụng mới:**
   - App title: `Bank Transaction Bot` (tùy ý)
   - Short name: `banktransbot` (tùy ý)
4. **Copy thông tin:**
   - `App api_id`: Dãy số (VD: 1234567)
   - `App api_hash`: Chuỗi ký tự dài (VD: abc123def456...)

## 📝 Bước 2: Cập nhật config.js

Mở file `config.js` và thay đổi 3 dòng sau:

```javascript
apiId: '1234567',                    // Thay số này
apiHash: 'abc123def456ghi789',       // Thay chuỗi này  
phoneNumber: '+84901234567',         // Thay số điện thoại này
```

### ⚠️ Lưu ý quan trọng:
- **apiId:** Chỉ chứa số, không có dấu nháy kép
- **apiHash:** Có dấu nháy kép  
- **phoneNumber:** Có dấu `+` và mã quốc gia, có dấu nháy kép

### 🇻🇳 Mã quốc gia phổ biến:
- Việt Nam: `+84`
- Singapore: `+65`
- Malaysia: `+60`
- Thailand: `+66`

## 🚀 Bước 3: Chạy bot

```bash
# Cách 1: Double-click
run.bat

# Cách 2: Command line
npm start
```

## 🎯 Bước 4: Đăng nhập lần đầu

1. Bot sẽ hiển thị: `📱 Sử dụng số điện thoại từ config: +84901234567`
2. Telegram gửi mã xác nhận → Nhập mã
3. Nếu có 2FA → Nhập mật khẩu
4. **Xong!** Từ lần sau bot tự đăng nhập

## ✅ Bước 5: Test bot

1. Gửi `/help` trong bất kỳ chat nào
2. Bot reply → **Setup thành công!** 🎉
3. Gửi `/1 on` để bật chức năng
4. Test tin nhắn giao dịch

---

**Tổng thời gian setup: ~2-3 phút** ⏰ 