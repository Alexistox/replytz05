# Bank Transaction UserBot

UserBot Telegram: phát hiện giao dịch ngân hàng, auto-forward, copy, và **AI chat theo từng nhóm/DM**.

## AI chat (mặc định TẮT)

Trong từng nhóm hoặc chat riêng (admin):

```text
/ai on          # bật AI trả lời chat này
/ai off         # tắt
/ai provider claude|grok|openai
/ai prompt ...  # system prompt riêng
```

Cần key trong `.env`: `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `XAI_API_KEY` tùy `AI_PROVIDER`.

## Control API (Cursor / Claude / Grok điều khiển)

Đặt `CONTROL_API_TOKEN` trong `.env`. Bot lắng nghe `127.0.0.1:3847`.

Trên cùng VPS (self-hosted Cursor worker):

```bash
TOKEN=... # CONTROL_API_TOKEN
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3847/status
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3847/chats
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"text":"xin chào"}' http://127.0.0.1:3847/chats/-100123/send
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"enabled":true}' http://127.0.0.1:3847/ai/-100123
```

Endpoints: `/health`, `/status`, `/chats`, `/chats/:id/messages`, `/chats/:id/send`, `/ai/:chatId`, `/ai/provider`, `/command`.

## Chạy

```bash
cp .env.example .env   # điền credentials
npm install
npm start
```
