# WF1 / WF2 / WF3

Ba workflow **khác nhau**, mỗi cái một bot riêng.

**Quyền:** `/wf*` (và `/cc`) chỉ theo **admin/chủ Telegram của đúng nhóm** đang gõ lệnh. Không dùng quyền admin bot cục bộ (`adminUsers` / PERMANENT_ADMIN). Trong DM thì người đang chat với userbot.

## WF1 — sửa thời gian **không giây**

```text
/wf1bot @bot_A
/wf1 on
```

`151126-18:34:26` → chỉnh thành `15/11/2026 18:34` (bỏ giây).

## WF3 — giống WF1 nhưng **có giây**

```text
/wf3bot @bot_C
/wf3 on
```

`151126-18:34:26` → chỉnh thành `15/11/2026 18:34:26` (giữ giây).

Luồng chung WF1/WF3: `/start` → button 1 → 2 → **user chọn còn hạn hoặc hết hạn** → chọn TK → chỉnh giao dịch → đồng bộ Thời gian theo Nội dung → Quay lại → chờ bảng mới → Quay lại. Quét nhiều trang đến khi hết GD lệch.

### `/wf1` + list Cộng/Trừ (logic pha B)

Khi gửi **`/wf1` kèm list** `N. Cộng|Trừ` + `/bdsd …` **có SĐT**, WF1 tự:

1. Chọn TK theo SĐT (còn hạn → hết hạn)
2. Tìm GD theo số tiền
3. Dòng **Trừ** → đổi loại + Quay lại
4. Sửa giờ theo Nội dung

Tin này **không** bị WF2/WF4 đang hearing nhận.

```text
/wf1
1. Cộng
/bdsd 0363… …
2. Trừ
/bdsd 0363… …
```

Hủy: `/wf1 off` hoặc `/wf3 off`

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

## WF4 — gửi `/bdsd` lên bot A, chỉnh trên bot B

Bot tạo GD qua `/bdsd` luôn ra **Cộng**. WF4: gửi từng lệnh lên **A**, rồi trên **B** sửa thời gian (như WF1, không giây). Dòng nhãn **Trừ** thêm bước đổi Cộng → Trừ.

```text
/wf4bot @BotTaoBdsd @BankAoGiaRe_Bot
/wf4 on
```

**Chế độ ON liên tục** đến `/wf4 off`:
1. `/wf4 on` → dán list/mục (chưa đụng B)
2. Gửi hết batch lên **A**
3. Bot B tự chọn: **còn hạn** → tìm TK cùng SĐT `/bdsd`; không thấy → **Quay lại** → **hết hạn** → tìm tiếp
4. Trên B: dòng **Trừ** đổi loại + Quay lại sửa giờ; mọi dòng sửa giờ
5. Xong batch vẫn ON — dán tiếp (đang bận thì xếp hàng)

```text
1. Cộng
/bdsd …
```
rồi sau đó dán tiếp:
```text
2. Trừ
/bdsd …
```

**Không** chạy WF2 và WF4 cùng một chat.

Lỗi pha B (không thấy GD / sửa giờ…)? Chạy lại **chỉ B**, không gửi A:

```text
/phab
```

Hoặc dán lại list kèm lệnh:

```text
/phab
1. Trừ
/bdsd …
```

Tắt: `/wf4 off`
