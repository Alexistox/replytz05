# Cách 2 — Dùng Cursor trên máy nhà để điều khiển bot trên VPS

Bạn ngồi máy tính / điện thoại nhà. AI (Claude/Grok trong Cursor) **làm việc trên VPS**, đứng cạnh userbot, nên điều khiển được nhóm và chat riêng.

Worker của bạn đã có sẵn: **`replytz05` trên máy `srv2043869`**.

---

## A. Chuẩn bị một lần (trên VPS)

1. Merge PR có tính năng Control API + `/ai`, rồi cập nhật code trên VPS.
2. Mở file `.env` của bot, thêm (ví dụ):

```bash
AI_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
CONTROL_API_TOKEN=dat-mot-chuoi-bi-mat-dai
```

(Đổi sang Grok thì `AI_PROVIDER=grok` + `XAI_API_KEY=...`)

3. Restart userbot. Khi chạy đúng sẽ thấy dòng kiểu:  
   `Control API lắng nghe http://127.0.0.1:3847`
4. Giữ **Cursor worker** trên VPS đang chạy (máy nhà bạn đã thấy worker `~/replytz05 @ srv2043869` online là ổn).

---

## B. Mỗi lần muốn AI điều khiển bot

1. Mở trình duyệt: [https://cursor.com/agents](https://cursor.com/agents)  
   (hoặc Agents trong app Cursor — cùng tài khoản).
2. Tìm chỗ chọn **chạy ở đâu** (*Run on* / *My Machines* / *Remote*).
3. Chọn máy **`replytz05`** (hoặc tên tương tự trên `srv2043869`) — **không** chọn Cloud VM thông thường.
4. Gõ việc cần làm, ví dụ:
   - `Liệt kê các chat, rồi gửi "xin chào" vào nhóm có ID ...`
   - `Bật AI cho chat -100...`
   - `Đọc 20 tin gần nhất của chat ...`

AI trên VPS sẽ dùng lệnh sẵn có:

```bash
node control-cli.js status
node control-cli.js chats
node control-cli.js send <chatId> nội dung
node control-cli.js ai-on <chatId>
```

---

## C. Bật AI tự trả lời trong một nhóm/DM

Trong Telegram (bằng tài khoản admin), vào đúng chat đó gõ:

```text
/ai on
```

Tắt:

```text
/ai off
```

Hoặc bảo Cursor agent trên VPS: `bật AI cho chat <id>`.

---

## Lưu ý ngắn

- Máy nhà **không** cần mở cổng hay SSH tunnel.
- Worker trên VPS phải **đang bật**; tắt worker thì Cursor không “đứng cạnh bot” được.
- Control API chỉ nghe trong VPS (`127.0.0.1`) — an toàn, không mở ra internet.
