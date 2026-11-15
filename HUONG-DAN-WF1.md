# WF1 / WF2 — Điều khiển bot khác + sửa thời gian giao dịch

Hai workflow **giống nhau**, nhưng **mỗi cái một bot riêng**.

## Cấu hình bot

```text
/wf1bot @bot_A
/wf2bot @bot_B
```

Alias WF1: `/wfbot` = `/wf1bot`

## Chạy

```text
/wf1 on
```

hoặc

```text
/wf2 on
```

## Luồng (giống nhau)

1. `/start` → button **1** → button **2** → **Tài khoản còn hạn**
2. Liệt kê button tài khoản → bạn chọn (`1` hoặc tên)
3. **Chỉnh Giao Dịch** (bỏ qua menu “Chỉnh sửa” nếu không có)
4. Lặp từng GD:
   - `Nội dung:` hỗ trợ `151126-18:34:26` → **15/11/2026 18:34**
   - Mục Thời gian còn giây / lệch → chỉnh thành `dd/mm/yyyy HH:mm`
   - Sau chỉnh: chờ tin mới → **Quay lại** ×2 → list
   - Hết trang → button loạt tiếp theo
5. Dừng khi không còn GD cần sửa

Hủy: `/wf1 off` hoặc `/wf2 off`
