/**
 * Workflow WF4 — gửi /bdsd lên bot A, rồi trên bot B:
 * - Mọi dòng: đồng bộ Thời gian như WF1 (không giây)
 * - Chỉ dòng nhãn "Trừ": đổi Loại giao dịch Cộng → Trừ
 *
 * Format list:
 *   1. Cộng
 *   /bdsd …
 *   2. Trừ
 *   /bdsd …
 *
 * /wf4bot @botA @botB
 * /wf4 on → chọn filter/TK trên B → dán list
 */

const Utils = require('./utils');
const {
  WfRunner,
  BTN,
  extractContentTime,
  extractFieldTime,
  extractFieldTimeRaw,
  shouldSkipTimeEdit,
  fieldMatchesTarget,
  bodyAmountInfo,
  findButton,
} = require('./workflow-wf1');
const { BDSD_LINE } = require('./workflow-wf2');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const KIND_LINE_RE =
  /^\s*\d+\.\s*(C[oộ]ng|Tr[uừ]|Cong|Tru)\s*$/im;

function normalizeKind(raw) {
  const s = String(raw || '')
    .normalize('NFC')
    .toLowerCase();
  if (/tr[uừ]|tru/.test(s)) return 'tru';
  return 'cong';
}

/** Parse list có nhãn Cộng/Trừ + /bdsd */
function extractWf4Items(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const items = [];
  let pendingKind = null;
  for (const line of lines) {
    if (/^\/wf4(bot)?(\s|$|@)/i.test(line) && !BDSD_LINE.test(line)) continue;
    const km = line.match(KIND_LINE_RE);
    if (km) {
      pendingKind = normalizeKind(km[1]);
      continue;
    }
    if (BDSD_LINE.test(line)) {
      if (!pendingKind) {
        const err = new Error(
          'Mỗi dòng `/bdsd` cần có nhãn trước đó, vd `2. Trừ` rồi mới `/bdsd …`.'
        );
        err.code = 'WF4_FORMAT';
        throw err;
      }
      items.push({ kind: pendingKind, line: line.replace(/^\s+/, '') });
      pendingKind = null;
    }
  }
  return items;
}

function looksLikeWf4List(text) {
  const raw = String(text || '');
  const hasKind = /^\s*\d+\.\s*(C[oộ]ng|Tr[uừ]|Cong|Tru)\s*$/im.test(raw);
  const hasBdsd = /^\s*\/bdsd\s+\S+/im.test(raw);
  if (!hasKind || !hasBdsd) return false;
  try {
    return extractWf4Items(raw).length > 0;
  } catch (_e) {
    return false;
  }
}

/** /bdsd phone pass NAME STK amount GD:… */
function parseBdsdFields(line) {
  const raw = String(line || '').trim();
  const m = raw.match(
    /^\/bdsd\s+(\S+)\s+(\S+)\s+(.+?)\s+(\d{8,16})\s+(\d+)\s+(.*)$/i
  );
  if (m) {
    return {
      phone: m[1],
      pass: m[2],
      name: m[3].trim(),
      stk: m[4],
      amountDigits: String(m[5]).replace(/\D/g, ''),
      content: m[6].trim(),
    };
  }
  const gdIdx = raw.search(/\bGD\s*:/i);
  const head = gdIdx >= 0 ? raw.slice(0, gdIdx) : raw;
  const content = gdIdx >= 0 ? raw.slice(gdIdx).trim() : '';
  const nums = [...head.matchAll(/\b(\d+)\b/g)].map((x) => x[1]);
  const amountDigits = nums.length ? nums[nums.length - 1] : '';
  const stk = nums.length >= 2 ? nums[nums.length - 2] : '';
  return { phone: '', pass: '', name: '', stk, amountDigits, content };
}

function contentNeedle(content) {
  const c = String(content || '');
  const gdCode =
    c.match(/\bGD\s+([A-Z0-9]{8,})\b/i) ||
    c.match(/\b(FT\d+)\b/i) ||
    c.match(/\b(6319[A-Z0-9]+)\b/i);
  if (gdCode) return gdCode[1];
  const compact = c.match(/\d{6,8}[-–—]\d{1,2}:\d{2}/);
  if (compact) return compact[0];
  return c.replace(/^GD\s*:\s*/i, '').slice(0, 40).trim();
}

class Wf4Runner extends WfRunner {
  constructor(bot) {
    super(bot, { id: 'wf4', label: 'WF4', keepSeconds: false });
    this.replyWaitMs = 45000;
    this.gapMs = 1500;
  }

  getBotA() {
    return String(this.getSettings().wf4BotA || '').trim();
  }

  getBotB() {
    return String(this.getSettings().wf4BotB || '').trim();
  }

  setBots(a, b) {
    const wf = this.getSettings();
    wf.wf4BotA = String(a || '').trim();
    wf.wf4BotB = String(b || '').trim();
    wf.wf4BotPeer = wf.wf4BotB; // legacy single key → B
    Utils.saveSettings(this.bot.settings);
  }

  /** Navigation / edit luôn dùng bot B */
  getBotPeerConfig() {
    return this.getBotB();
  }

  setBotPeerConfig(peer) {
    this.getSettings().wf4BotB = String(peer || '').trim();
    Utils.saveSettings(this.bot.settings);
  }

  isActive(controlChatId) {
    return !!this.getSession(controlChatId);
  }

  isAwaitingUserInput(controlChatId) {
    const s = this.getSession(controlChatId);
    return (
      s &&
      (s.phase === 'await_account_filter' ||
        s.phase === 'await_account' ||
        s.phase === 'await_list')
    );
  }

  isAwaitingList(controlChatId) {
    const s = this.getSession(controlChatId);
    return s && s.phase === 'await_list';
  }

  isBusy(controlChatId) {
    const s = this.getSession(controlChatId);
    return s && s.phase === 'processing';
  }

  /** WF2 đang chiếm chat? */
  assertWf2Idle(chatId) {
    const wf2 = this.bot.wf2;
    if (!wf2) return;
    if (wf2.isBusy?.(chatId) || wf2.isAwaitingUserInput?.(chatId) || wf2.getSession?.(chatId)) {
      throw new Error('WF2 đang bật trên chat này — `/wf2 off` rồi mới `/wf4 on`.');
    }
  }

  async handleWfBotCommand(args, chatId, messageId) {
    if (args.length < 2) {
      const a = this.getBotA() || '(chưa)';
      const b = this.getBotB() || '(chưa)';
      await this.bot.sendReply(
        chatId,
        messageId,
        [
          `🤖 WF4 bot A (nhận /bdsd): \`${a}\``,
          `🤖 WF4 bot B (chỉnh GD): \`${b}\``,
          '',
          'Đặt: `/wf4bot @botA @botB`',
          'Chạy: `/wf4 on` rồi dán list `N. Cộng|Trừ` + `/bdsd …`',
        ].join('\n')
      );
      return;
    }
    const peerA = args[0].trim();
    const peerB = args.slice(1).join(' ').trim();
    try {
      const entA = await this.resolvePeer(peerA);
      const entB = await this.resolvePeer(peerB);
      const labelOf = (e, raw) =>
        e.username
          ? `@${e.username}`
          : `${e.firstName || e.title || ''}`.trim() || raw;
      const storeOf = (e, raw) => {
        if (e.username) return `@${e.username}`;
        return e.id != null ? String(e.id) : raw;
      };
      const storeA = storeOf(entA, peerA);
      const storeB = storeOf(entB, peerB);
      this.setBots(storeA, storeB);
      await this.bot.sendReply(
        chatId,
        messageId,
        [
          `✅ WF4 đã đặt:`,
          `A (bdsd): ${labelOf(entA, peerA)} (\`${storeA}\`)`,
          `B (chỉnh): ${labelOf(entB, peerB)} (\`${storeB}\`)`,
        ].join('\n')
      );
    } catch (e) {
      await this.bot.sendReply(
        chatId,
        messageId,
        `❌ Không resolve được bot: ${e.message}`
      );
    }
  }

  async handleWfCommand(args, chatId, messageId, rawText = '') {
    const action = String(args[0] || 'help').toLowerCase();
    if (action === 'off' || action === 'stop' || action === 'cancel') {
      const s = this.getSession(chatId);
      if (s) s.cancel = true;
      this.clearSession(chatId);
      await this.bot.sendReply(chatId, messageId, '🛑 Đã tắt / hủy WF4.');
      return;
    }
    if (action === 'status') {
      const s = this.getSession(chatId);
      await this.bot.sendReply(
        chatId,
        messageId,
        [
          `WF4: ${s ? `🟢 ${s.phase}` : '🔴 idle'}`,
          `A: \`${this.getBotA() || '(chưa)'}\``,
          `B: \`${this.getBotB() || '(chưa)'}\``,
          s?.stats
            ? `Gửi A: ${s.stats.sentA || 0} · Đổi Trừ: ${s.stats.flipped || 0} · Giờ: ${s.stats.fixedTime || 0} · Lỗi: ${s.stats.errors || 0}`
            : '',
        ]
          .filter(Boolean)
          .join('\n')
      );
      return;
    }

    // /wf4 + list trong cùng tin
    if (looksLikeWf4List(rawText)) {
      try {
        this.assertWf2Idle(chatId);
      } catch (e) {
        await this.bot.sendReply(chatId, messageId, `❌ ${e.message}`);
        return;
      }
      if (!this.getBotA() || !this.getBotB()) {
        await this.bot.sendReply(
          chatId,
          messageId,
          '❌ Chưa đặt 2 bot. Dùng: `/wf4bot @botA @botB`'
        );
        return;
      }
      await this.bot.sendReply(chatId, messageId, '🚀 Bắt đầu WF4…');
      this.runUntilAccountPick(chatId, messageId)
        .then(async () => {
          /* chờ user chọn TK rồi list — nếu list đã có trong tin đầu thì lưu pending */
          const s = this.getSession(chatId);
          if (s) s.pendingListText = rawText;
        })
        .catch(async (err) => {
          this.clearSession(chatId);
          await this.notify(chatId, `❌ WF4 lỗi: ${err.message}`, messageId);
        });
      return;
    }

    if (!action || action === 'help') {
      await this.bot.sendReply(
        chatId,
        messageId,
        [
          '**WF4** — gửi `/bdsd` lên A, trên B sửa giờ (như WF1); dòng **Trừ** thêm đổi loại',
          '',
          '`/wf4bot @botA @botB` — A nhận bdsd, B chỉnh GD',
          '`/wf4 on` — chọn TK trên B rồi dán list',
          'List:',
          '`1. Cộng` / `2. Trừ` rồi dòng `/bdsd …`',
          '`/wf4 off` · `/wf4 status`',
          'Không chạy song song WF2 cùng chat.',
        ].join('\n')
      );
      return;
    }

    if (action === 'on' || action === 'start' || action === 'run') {
      try {
        this.assertWf2Idle(chatId);
      } catch (e) {
        await this.bot.sendReply(chatId, messageId, `❌ ${e.message}`);
        return;
      }
      if (this.isBusy(chatId)) {
        await this.bot.sendReply(
          chatId,
          messageId,
          '⏳ WF4 đang chạy — `/wf4 off` để hủy.'
        );
        return;
      }
      if (!this.getBotA() || !this.getBotB()) {
        await this.bot.sendReply(
          chatId,
          messageId,
          '❌ Chưa đặt 2 bot. Dùng: `/wf4bot @botA @botB` rồi `/wf4 on`.'
        );
        return;
      }
      await this.bot.sendReply(
        chatId,
        messageId,
        `🚀 WF4: A=\`${this.getBotA()}\` · B=\`${this.getBotB()}\``
      );
      this.runUntilAccountPick(chatId, messageId).catch(async (err) => {
        this.clearSession(chatId);
        await this.notify(chatId, `❌ WF4 lỗi: ${err.message}`, messageId);
      });
      return;
    }

    await this.handleWfBotCommand(args, chatId, messageId);
  }

  async continueAfterAccount(controlChatId) {
    const session = this.getSession(controlChatId);
    if (!session) return;
    const { peer, replyTo } = session;

    let msg = session.lastMsg || (await this.getLatestMessage(peer));
    msg = await this.clickButton(msg, session.chosenAccount, peer);

    const flatAfterAccount = await this.getButtons(msg);
    if (findButton(flatAfterAccount, BTN.editTxMenu)) {
      await this.notify(controlChatId, '👆 Chỉnh sửa giao dịch…', replyTo);
      msg = await this.clickButton(msg, BTN.editTxMenu, peer);
    }

    await this.notify(controlChatId, '👆 Chỉnh giao dịch…', replyTo);
    msg = await this.clickButton(msg, BTN.editTx, peer);

    session.phase = 'await_list';
    session.lastMsg = msg;
    session.listMsg = msg;
    session.stats = {
      sentA: 0,
      flipped: 0,
      fixedTime: 0,
      skippedFlip: 0,
      skippedTime: 0,
      errors: 0,
    };

    const pending = session.pendingListText;
    delete session.pendingListText;
    if (pending && looksLikeWf4List(pending)) {
      await this.notify(
        controlChatId,
        '📥 Có list trong tin trước — bắt đầu xử lý…',
        replyTo
      );
      await this.startItemsFromText(pending, controlChatId, replyTo);
      return;
    }

    await this.notify(
      controlChatId,
      [
        '📥 WF4 sẵn sàng — dán list dạng:',
        '`1. Cộng` / `2. Trừ` rồi dòng `/bdsd …`',
        'Mọi dòng: gửi A + sửa giờ trên B.',
        'Chỉ dòng **Trừ**: thêm đổi Cộng → Trừ trên B.',
        'Hủy: `/wf4 off`',
      ].join('\n'),
      replyTo
    );
  }

  async handleIncomingList(chatId, messageText, messageId) {
    if (!this.isAwaitingList(chatId)) {
      if (this.isAwaitingUserInput(chatId)) {
        await this.notify(
          chatId,
          '❗ WF4 đang chờ chọn còn/hết hạn hoặc tài khoản — chọn xong rồi mới dán list.',
          messageId
        );
        return true;
      }
      return false;
    }
    if (this.isBusy(chatId)) {
      await this.notify(chatId, '⏳ WF4 đang xử lý — đợi hoặc `/wf4 off`.', messageId);
      return true;
    }
    return this.startItemsFromText(messageText, chatId, messageId);
  }

  async startItemsFromText(text, controlChatId, replyTo) {
    let items;
    try {
      items = extractWf4Items(text);
    } catch (e) {
      await this.notify(controlChatId, `❌ Format list: ${e.message}`, replyTo);
      return true;
    }
    if (!items.length) {
      await this.notify(
        controlChatId,
        '❗ Không parse được mục nào. Cần `N. Cộng|Trừ` rồi `/bdsd …`.',
        replyTo
      );
      return true;
    }

    const session = this.getSession(controlChatId);
    if (!session) return false;

    let peerA;
    try {
      peerA = await this.resolvePeer(this.getBotA());
    } catch (e) {
      await this.notify(controlChatId, `❌ Bot A: ${e.message}`, replyTo);
      return true;
    }

    session.phase = 'processing';
    session.peerA = peerA;
    session.items = items;
    session.cancel = false;
    session.stats = session.stats || {
      sentA: 0,
      flipped: 0,
      fixedTime: 0,
      skippedFlip: 0,
      skippedTime: 0,
      errors: 0,
    };

    const nCong = items.filter((i) => i.kind === 'cong').length;
    const nTru = items.filter((i) => i.kind === 'tru').length;
    await this.notify(
      controlChatId,
      `🚀 WF4: ${items.length} mục (Cộng ${nCong} · Trừ ${nTru})\nA=\`${this.getBotA()}\` · B=\`${this.getBotB()}\``,
      replyTo
    );

    this.runItems(controlChatId).catch(async (err) => {
      this.clearSession(controlChatId);
      await this.notify(controlChatId, `❌ WF4 lỗi: ${err.message}`, replyTo);
    });
    return true;
  }

  async getLatestBotMsgId(peer) {
    const msgs = await this.bot.client.getMessages(peer, { limit: 5 });
    return msgs && msgs[0] ? msgs[0].id : 0;
  }

  async waitForBotReply(peer, afterId, timeoutMs, controlChatId) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const s = this.getSession(controlChatId);
      if (!s || s.cancel) return null;
      const msgs = await this.bot.client.getMessages(peer, { limit: 8 });
      if (msgs && msgs.length) {
        const newer = msgs.filter((m) => m && m.id > afterId && !m.out);
        if (newer.length) return newer.reduce((a, b) => (a.id > b.id ? a : b));
      }
      await sleep(1200);
    }
    return null;
  }

  async sendBdsdToA(session, line, controlChatId) {
    const peerA = session.peerA;
    let beforeId = 0;
    try {
      beforeId = await this.getLatestBotMsgId(peerA);
    } catch (_e) {
      beforeId = 0;
    }
    await this.bot.client.sendMessage(peerA, { message: line });
    session.stats.sentA = (session.stats.sentA || 0) + 1;
    const reply = await this.waitForBotReply(
      peerA,
      beforeId,
      this.replyWaitMs,
      controlChatId
    );
    return !!reply;
  }

  async editTypeToTru(detailMsg, peer) {
    let msg = detailMsg;
    const flat = await this.getButtons(msg);
    const truBtn =
      flat.find((b) => /lo[aạ]i\s*giao\s*d[iị]ch\s*:\s*tr[uừ]\s*ti[eề]n/i.test(b.text)) ||
      flat.find((b) => /^tr[uừ]\s*ti[eề]n$/i.test(b.text)) ||
      flat.find((b) => /tr[uừ]\s*ti[eề]n/i.test(b.text) && /lo[aạ]i|giao\s*d[iị]ch/i.test(b.text));
    if (!truBtn) {
      throw new Error(
        `Không thấy nút Trừ tiền. Buttons: ${flat.map((b) => b.text).join(' | ') || '(không)'}`
      );
    }
    msg = await this.clickButton(msg, truBtn.text, peer);
    await sleep(800);
    // Có thể vẫn ở chi tiết (toggle) hoặc tin mới
    let body = String(msg?.message || msg?.text || '');
    if (!/S[uử]a\s*Giao\s*D[iị]ch/i.test(body)) {
      const withBack = await this.findMessageWithBack(peer);
      if (withBack) {
        msg = withBack;
        body = String(msg.message || msg.text || '');
      }
    }
    const info = bodyAmountInfo(body);
    if (info && info.sign !== '-') {
      throw new Error(`Sau bấm Trừ vẫn chưa phải Trừ tiền (sign=${info.sign}).`);
    }
    return msg;
  }

  detailMatchesItem(body, fields) {
    if (!/S[uử]a\s*Giao\s*D[iị]ch\s*#/i.test(body)) return false;
    const info = bodyAmountInfo(body);
    if (!info || !fields.amountDigits) return false;
    if (info.digits !== fields.amountDigits) return false;
    const raw = String(body || '');
    if (fields.stk && raw.includes(fields.stk)) return true;
    const needle = contentNeedle(fields.content);
    if (needle && raw.toLowerCase().includes(String(needle).toLowerCase())) {
      return true;
    }
    if (fields.content) {
      const chunk = fields.content.replace(/^GD\s*:\s*/i, '').slice(0, 24);
      if (chunk && raw.toLowerCase().includes(chunk.toLowerCase())) return true;
    }
    // Khớp đủ số tiền + (không có STK/needle để siết) → chấp nhận
    return !fields.stk && !needle;
  }

  async findAndOpenItemOnB(session, fields, controlChatId) {
    const { peer, replyTo } = session;
    let msg = session.listMsg || session.lastMsg || (await this.getLatestMessage(peer));
    msg = await this.ensureTxList(msg, peer);
    msg = await this.goToFirstTxPage(msg, peer);
    msg = await this.ensureTxList(msg, peer);

    let page = 1;
    let knownTotal = this.parseLsgdPage(msg)?.total || null;
    const maxPages = knownTotal || 20;

    for (let p = 0; p < maxPages; p++) {
      const nav = await this.goToTxPage(msg, peer, page);
      msg = nav.msg;
      page = nav.page || page;
      if (nav.total) knownTotal = nav.total;

      let flat = await this.getButtons(msg);
      const txButtons = flat.filter((b) => this.isLikelyTransactionButton(b.text));
      for (const btn of txButtons) {
        const labelDigits = ((btn.text.match(/(\d[\d.,]*)\s*đ/i) || [])[1] || '').replace(
          /\D/g,
          ''
        );
        if (
          fields.amountDigits &&
          labelDigits &&
          labelDigits !== fields.amountDigits
        ) {
          continue;
        }

        let detail = await this.clickAt(msg, btn.row, btn.col, peer);
        let body = String(detail?.message || detail?.text || '');
        if (this.detailMatchesItem(body, fields)) {
          return { detail, body, page, msg };
        }
        msg = await this.returnToTransactionList(detail, peer, { afterEdit: false });
        const backNav = await this.goToTxPage(msg, peer, page);
        msg = backNav.msg;
      }

      if (knownTotal != null && page >= knownTotal) break;
      flat = await this.getButtons(msg);
      const nextBtn = findButton(flat, BTN.nextPage);
      if (!nextBtn) break;
      const before = this.parseLsgdPage(msg)?.page || page;
      msg = await this.clickButton(msg, nextBtn.text, peer);
      await sleep(700);
      msg = (await this.findTxListMessage(peer)) || (await this.getLatestMessage(peer)) || msg;
      const after = this.parseLsgdPage(msg);
      if (!after || after.page <= before) break;
      page = after.page;
      if (after.total) knownTotal = after.total;
    }

    await this.notify(
      controlChatId,
      `⚠️ Không thấy GD khớp tiền ${fields.amountDigits || '?'} trên bot B.`,
      replyTo
    );
    return null;
  }

  async runItems(controlChatId) {
    const session = this.getSession(controlChatId);
    if (!session || session.phase !== 'processing') return;
    const { items, peer, replyTo } = session;
    const total = items.length;

    for (let i = 0; i < items.length; i++) {
      const s = this.getSession(controlChatId);
      if (!s || s.cancel || s.phase !== 'processing') {
        await this.notify(controlChatId, '🛑 WF4 đã hủy.', replyTo);
        this.clearSession(controlChatId);
        return;
      }

      const item = items[i];
      const fields = parseBdsdFields(item.line);
      const preview =
        item.line.length > 100 ? item.line.slice(0, 97) + '…' : item.line;
      const tag = item.kind === 'tru' ? 'Trừ' : 'Cộng';

      await this.notify(
        controlChatId,
        `▶️ [${i + 1}/${total}] ${tag}\n\`${preview}\``,
        replyTo
      );

      // 1) Gửi A
      let sentOk = false;
      try {
        sentOk = await this.sendBdsdToA(s, item.line, controlChatId);
        await this.notify(
          controlChatId,
          sentOk
            ? `✅ [${i + 1}] Đã gửi A`
            : `⚠️ [${i + 1}] Đã gửi A (chưa thấy reply)`,
          replyTo
        );
      } catch (e) {
        s.stats.errors += 1;
        await this.notify(
          controlChatId,
          `❌ [${i + 1}] Gửi A lỗi: ${e.message} — bỏ qua B`,
          replyTo
        );
        await sleep(this.gapMs);
        continue;
      }

      // 2) Tìm + chỉnh trên B
      try {
        const found = await this.findAndOpenItemOnB(s, fields, controlChatId);
        if (!found) {
          s.stats.errors += 1;
          await sleep(this.gapMs);
          continue;
        }

        let { detail, body, page } = found;
        s.currentPage = page;

        // Flip nếu Trừ
        if (item.kind === 'tru') {
          const info = bodyAmountInfo(body);
          if (info && info.sign === '-') {
            s.stats.skippedFlip += 1;
            await this.notify(controlChatId, `⏭️ [${i + 1}] Đã là Trừ — bỏ qua đổi loại`, replyTo);
          } else {
            detail = await this.editTypeToTru(detail, peer);
            body = String(detail?.message || detail?.text || '');
            s.stats.flipped += 1;
            await this.notify(controlChatId, `✅ [${i + 1}] Đã đổi → Trừ`, replyTo);
          }
        }

        // Sync time (WF1 style)
        const contentTime = extractContentTime(body, false);
        const fieldTime = extractFieldTime(body, false);
        const rawField = extractFieldTimeRaw(body);
        if (!contentTime) {
          await this.notify(
            controlChatId,
            `⚠️ [${i + 1}] Không parse được giờ Nội dung — bỏ qua sửa giờ`,
            replyTo
          );
        } else if (shouldSkipTimeEdit(contentTime, fieldTime, rawField, false)) {
          s.stats.skippedTime += 1;
          await this.notify(
            controlChatId,
            `⏭️ [${i + 1}] Giờ đã đúng (${contentTime})`,
            replyTo
          );
        } else {
          detail = await this.editTimeOnDetail(detail, peer, contentTime);
          body = String(detail?.message || detail?.text || '');
          const rawAfter = extractFieldTimeRaw(body);
          const fieldAfter = extractFieldTime(body, false);
          if (!fieldMatchesTarget(rawAfter, fieldAfter, contentTime, false)) {
            // soft accept: bank may keep seconds display
            const soft =
              fieldAfter &&
              contentTime &&
              fieldAfter.replace(/:\d{2}$/, '') === contentTime.replace(/:\d{2}$/, '');
            if (!soft) {
              throw new Error(
                `Sau sửa giờ vẫn lệch: ${rawAfter || fieldAfter} (cần ${contentTime})`
              );
            }
          }
          s.stats.fixedTime += 1;
          await this.notify(
            controlChatId,
            `✅ [${i + 1}] Giờ → ${contentTime}`,
            replyTo
          );
        }

        let listMsg = await this.returnToTransactionList(detail, peer, {
          afterEdit: true,
        });
        const nav = await this.goToTxPage(listMsg, peer, page || 1);
        s.listMsg = nav.msg;
        s.lastMsg = nav.msg;
      } catch (e) {
        s.stats.errors += 1;
        await this.notify(
          controlChatId,
          `❌ [${i + 1}] Bot B: ${e.message}`,
          replyTo
        );
        try {
          const latest = await this.getLatestMessage(peer);
          let listMsg = await this.returnToTransactionList(latest, peer, {
            afterEdit: false,
          });
          const nav = await this.goToTxPage(listMsg, peer, s.currentPage || 1);
          s.listMsg = nav.msg;
        } catch (_e) {
          /* ignore */
        }
      }

      if (i < items.length - 1) await sleep(this.gapMs);
    }

    const done = this.getSession(controlChatId);
    const st = done?.stats || {};
    this.clearSession(controlChatId);
    await this.notify(
      controlChatId,
      [
        `🏁 WF4 xong (${total} mục).`,
        `Gửi A: ${st.sentA || 0}`,
        `Đổi Trừ: ${st.flipped || 0} (bỏ qua ${st.skippedFlip || 0})`,
        `Sửa giờ: ${st.fixedTime || 0} (đã đúng ${st.skippedTime || 0})`,
        `Lỗi: ${st.errors || 0}`,
      ].join('\n'),
      replyTo
    );
  }
}

module.exports = {
  Wf4Runner,
  extractWf4Items,
  looksLikeWf4List,
  parseBdsdFields,
  KIND_LINE_RE,
};
