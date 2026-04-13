# Chạy bot bằng Docker

## Chuẩn bị trên máy host

1. **API Telegram trong Docker:** sửa `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_PHONE_NUMBER` trong [`docker-compose.yml`](./docker-compose.yml) (mục `environment`). `config.js` ưu tiên các biến này khi container chạy.

2. **`config.js` (volume):** copy từ `config.example.js` nếu cần; sau đăng nhập bot đồng bộ `sessionString` vào file này (và ghi `telegram.session`).

3. **`telegram.session`:** bot **tự lưu session** sau lần đăng nhập đầu (OTP/2FA). Trước `docker compose up` lần đầu, tạo file rỗng trên host để bind mount không thành thư mục:

   ```bash
   touch telegram.session
   ```

   Windows (PowerShell): `New-Item -Path telegram.session -ItemType File -Force`

4. **Tạo `settings.json`** (nếu chưa có — tránh Docker tạo nhầm thành thư mục):

   ```bash
   echo {} > settings.json
   ```

   Trên Windows (PowerShell):

   ```powershell
   Set-Content -Path settings.json -Value '{}'
   ```

## Build và chạy

```bash
docker compose build
docker compose up -d
```

Xem log:

```bash
docker compose logs -f replytz-userbot
```

Dừng:

```bash
docker compose down
```

## Đăng nhập Telegram lần đầu (OTP / 2FA)

Khi `sessionString` trong `config.js` còn trống, bot cần nhập mã trên console.

1. Chạy tạm với TTY (không `-d`):

   ```bash
   docker compose run --rm replytz-userbot
   ```

   Hoặc:

   ```bash
   docker compose up
   ```

2. Nhập mã OTP / mật khẩu 2FA theo hướng dẫn trong terminal.

3. Sau khi session được lưu tự động vào `telegram.session` và `config.js`, chạy nền:

   ```bash
   docker compose up -d
   ```

## Lưu ý

- Không nên đẩy `docker-compose.yml` chứa API hash / SĐT lên kho mã **công khai**; có thể dùng file `.env` (thêm vào `.gitignore`) và trong yml dùng `${TELEGRAM_API_HASH}` v.v.
- `config.js`, `settings.json` và `telegram.session` gắn volume — session được bot ghi sau lần đăng nhập thành công.
- Account Telegram phải là thành viên các nhóm/kênh cần dùng.
- Múi giờ log mặc định trong compose: `Asia/Ho_Chi_Minh` (đổi trong `docker-compose.yml` nếu muốn).
- **Giới hạn /copyall:** trong `config.js` sửa `copyAllMaxCollect` / `copyAllMaxCopy`, hoặc trong `docker-compose.yml` đặt biến môi trường `COPYALL_MAX_COLLECT`, `COPYALL_MAX_COPY` (chuỗi số, ví dụ `"10000"`).
- **Lọc QC/cờ bạc khi copy:** mặc định bật. Tắt: `COPY_POLICY_FILTER=0` trong `environment` của compose.
