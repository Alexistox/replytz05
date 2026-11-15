# WF1 / WF2

Hai workflow **khác nhau**, mỗi cái một bot riêng.

## WF1 — sửa thời gian giao dịch trên bot

```text
/wf1bot @bot_A
/wf1 on
```

Luồng: `/start` → button 1 → 2 → tài khoản còn hạn → chọn TK → chỉnh giao dịch → đồng bộ Thời gian theo Nội dung (`151126-18:34:26` → không giây) → Quay lại → chờ bảng mới → Quay lại. Sau mỗi lần sửa list đổi chỗ theo thời gian — bot quét lại trang/các trang (nút Sau) đến khi một vòng full không còn GD lệch.

Hủy: `/wf1 off`

## WF2 — gửi lần lượt list `/bdsd` lên bot khác

```text
/wf2bot @bot_B
```

Rồi dán list (mỗi dòng một lệnh):

```text
/bdsd 0931582074 Abc112112@ LUONG VAN NAM 28830381 2500000 GD: chuyen tien tra no GD 6319A7KD3QX9M2TF 121126-08:14:22
/bdsd 0931582074 Abc112112@ DO DUY NHUAN 26754321 1200000 GD: IB LUONG VAN NAM CHUYEN KHOAN GD 6319H2PZ8WL4N6RC 121126-15:42:09
```

Hoặc:

```text
/wf2
```

rồi dán list ở tin tiếp theo; hoặc `/wf2` + list trong cùng một tin.

Userbot gửi **từng** `/bdsd` lên bot WF2, chờ reply rồi mới gửi dòng kế.

Hủy: `/wf2 off`
