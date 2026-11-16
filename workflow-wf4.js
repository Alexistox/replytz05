/**
 * Workflow WF4 — chế độ ON liên tục đến /wf4 off.
 *
 * Luồng:
 * 1) /wf4 on → chờ dán list (chưa đụng B)
 * 2) Gửi hết /bdsd batch lên A
 * 3) A xong → lần đầu chọn TK trên B; lần sau tái dùng TK
 * 4) Trên B: Trừ flip + sửa giờ
 * 5) Xong batch → vẫn ON, nhận list tiếp (hoặc hàng đợi nếu đang bận)
 *
 * /wf4bot @botA @botB
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

function emptyStats() {
  return {
    sentA: 0,
    flipped: 0,
    fixedTime: 0,
    skippedFlip: 0,
    skippedTime: 0,
    errors: 0,
  };
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
      (s.phase === 'await_list' ||
        s.phase === 'await_account_filter' ||
        s.phase === 'await_account')
    );
  }

  isAwaitingList(controlChatId) {
    const s = this.getSession(controlChatId);
    return s && s.phase === 'await_list';
  }

  isBusy(controlChatId) {
    const s = this.getSession(controlChatId);
    return s && (s.phase === 'sending_a' || s.phase === 'editing_b');
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
          'Chạy: `/wf4 on` rồi dán từng list/mục — bot giữ ON đến `/wf4 off`',
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

    // /wf4 + list cùng tin → gửi A trước, xong mới sang B
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
      this.sessions.set(String(chatId), {
        phase: 'await_list',
        replyTo: messageId,
        controlChatId: String(chatId),
        stats: emptyStats(),
      });
      await this.startPhaseA(rawText, chatId, messageId);
      return;
    }

    if (!action || action === 'help') {
      await this.bot.sendReply(
        chatId,
        messageId,
        [
          '**WF4** — ON liên tục: dán list → A hết → B chỉnh; dán tiếp được',
          '',
          '`/wf4bot @botA @botB`',
          '`/wf4 on` — bật, chờ dán list (chưa đụng B)',
          'List: `1. Cộng` / `2. Trừ` + `/bdsd …` (1 mục hoặc nhiều)',
          'Xong 1 batch vẫn ON — dán batch/mục tiếp; `/wf4 off` tắt',
          '`/wf4 status`',
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
      if (!this.getBotA() || !this.getBotB()) {
        await this.bot.sendReply(
          chatId,
          messageId,
          '❌ Chưa đặt 2 bot. Dùng: `/wf4bot @botA @botB` rồi `/wf4 on`.'
        );
        return;
      }
      if (this.isBusy(chatId)) {
        await this.bot.sendReply(
          chatId,
          messageId,
          '⏳ WF4 đang xử lý batch — đợi xong hoặc `/wf4 off`.'
        );
        return;
      }
      if (this.isActive(chatId)) {
        const s = this.getSession(chatId);
        if (
          s.phase === 'await_account_filter' ||
          s.phase === 'await_account'
        ) {
          await this.bot.sendReply(
            chatId,
            messageId,
            '⏳ WF4 đang chờ chọn TK trên B — chọn xong rồi dán list tiếp.'
          );
          return;
        }
        s.phase = 'await_list';
        s.replyTo = messageId;
        await this.bot.sendReply(
          chatId,
          messageId,
          [
            '✅ WF4 vẫn **ON** — dán list/mục tiếp.',
            s.chosenAccount
              ? `TK B đang dùng: ${s.chosenAccount}`
              : 'Lần đầu sau A sẽ hỏi chọn TK trên B.',
            'Tắt: `/wf4 off`',
          ].join('\n')
        );
        return;
      }
      // Chỉ chờ list — KHÔNG mở Bot B lúc này
      this.sessions.set(String(chatId), {
        phase: 'await_list',
        replyTo: messageId,
        controlChatId: String(chatId),
        stats: emptyStats(),
        totalSentA: 0,
      });
      await this.bot.sendReply(
        chatId,
        messageId,
        [
          `📥 WF4 **ON** — dán list \`N. Cộng|Trừ\` + \`/bdsd …\``,
          `A=\`${this.getBotA()}\` · B=\`${this.getBotB()}\``,
          'Mỗi lần dán: gửi A hết → chỉnh B. Xong vẫn ON, dán tiếp được.',
          'Tắt: `/wf4 off`',
        ].join('\n')
      );
      return;
    }

    await this.handleWfBotCommand(args, chatId, messageId);
  }

  /** Mở B chọn TK nhưng GIỮ items/stats/TK từ pha A */
  async runUntilAccountPick(controlChatId, replyTo) {
    const prev = this.getSession(controlChatId) || {};
    const saved = {
      items: prev.items,
      stats: prev.stats || emptyStats(),
      peerA: prev.peerA,
      replyTo: replyTo || prev.replyTo,
      totalSentA: prev.totalSentA || 0,
      queuedText: prev.queuedText,
      chosenAccount: prev.chosenAccount,
      listMsg: prev.listMsg,
    };
    await super.runUntilAccountPick(controlChatId, saved.replyTo);
    const s = this.getSession(controlChatId);
    if (!s) return;
    s.items = saved.items;
    s.stats = saved.stats;
    s.peerA = saved.peerA;
    s.replyTo = saved.replyTo;
    s.totalSentA = saved.totalSentA;
    s.queuedText = saved.queuedText;
    if (!s.items || !s.items.length) {
      throw new Error('Mất list sau pha A — hủy.');
    }
  }

  /** Đã có TK B từ batch trước → vào lại LSGD rồi chỉnh */
  async resumeEditOnB(controlChatId) {
    const session = this.getSession(controlChatId);
    if (!session || !session.peer || !session.chosenAccount) {
      await this.runUntilAccountPick(controlChatId, session?.replyTo);
      return;
    }
    const { peer, replyTo } = session;
    await this.notify(
      controlChatId,
      `♻️ Dùng lại TK B: ${session.chosenAccount}\n🔧 Chỉnh batch này trên B…`,
      replyTo
    );

    let msg =
      session.listMsg ||
      session.lastMsg ||
      (await this.getLatestMessage(peer));
    try {
      msg = await this.ensureTxList(msg, peer);
    } catch (_e) {
      // Màn hình lệch — mở lại từ tài khoản
      msg = await this.getLatestMessage(peer);
      try {
        msg = await this.clickButton(msg, session.chosenAccount, peer);
      } catch (_e2) {
        await this.runUntilAccountPick(controlChatId, replyTo);
        return;
      }
      const flat = await this.getButtons(msg);
      if (findButton(flat, BTN.editTxMenu)) {
        msg = await this.clickButton(msg, BTN.editTxMenu, peer);
      }
      msg = await this.clickButton(msg, BTN.editTx, peer);
    }

    session.lastMsg = msg;
    session.listMsg = msg;
    session.phase = 'editing_b';
    this.runEditAllOnB(controlChatId).catch(async (err) => {
      await this.notify(controlChatId, `❌ WF4 lỗi B: ${err.message}`, replyTo);
      await this.returnToAwaitList(controlChatId, null);
    });
  }

  /** Sau khi A xong + user chọn TK: vào LSGD rồi chỉnh trên B */
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

    session.lastMsg = msg;
    session.listMsg = msg;
    session.phase = 'editing_b';

    await this.notify(
      controlChatId,
      `✅ TK: ${session.chosenAccount}\n🔧 Bắt đầu chỉnh trên B (Trừ + giờ)…`,
      replyTo
    );

    this.runEditAllOnB(controlChatId).catch(async (err) => {
      await this.notify(controlChatId, `❌ WF4 lỗi B: ${err.message}`, replyTo);
      await this.returnToAwaitList(controlChatId, null);
    });
  }

  /** Xong batch → vẫn ON, nhận list tiếp / chạy hàng đợi */
  async returnToAwaitList(controlChatId, summaryLines) {
    const s = this.getSession(controlChatId);
    if (!s) return;
    if (s.cancel) {
      this.clearSession(controlChatId);
      return;
    }
    const queued = s.queuedText;
    delete s.queuedText;
    s.phase = 'await_list';
    s.items = [];
    s.cancel = false;

    if (summaryLines && summaryLines.length) {
      await this.notify(
        controlChatId,
        [...summaryLines, '', '📥 WF4 vẫn **ON** — dán list/mục tiếp (hoặc `/wf4 off`).'].join(
          '\n'
        ),
        s.replyTo
      );
    }

    if (queued && looksLikeWf4List(queued)) {
      await this.notify(
        controlChatId,
        '▶️ Có list xếp hàng — chạy tiếp…',
        s.replyTo
      );
      await this.startPhaseA(queued, controlChatId, s.replyTo);
    }
  }

  async handleIncomingList(chatId, messageText, messageId) {
    const session = this.getSession(chatId);
    if (!session) return false;

    if (this.isBusy(chatId)) {
      if (looksLikeWf4List(messageText)) {
        session.queuedText = messageText;
        await this.notify(
          chatId,
          '📥 Đã xếp hàng list tiếp — chạy ngay sau khi xong batch hiện tại.',
          messageId
        );
        return true;
      }
      await this.notify(chatId, '⏳ WF4 đang xử lý — đợi hoặc `/wf4 off`.', messageId);
      return true;
    }

    // Đang chọn TK trên B (sau khi A xong): không nhận list nữa
    if (
      session.phase === 'await_account_filter' ||
      session.phase === 'await_account'
    ) {
      if (looksLikeWf4List(messageText)) {
        session.queuedText = messageText;
        await this.notify(
          chatId,
          '📥 Đã xếp hàng list — chọn TK trên B xong sẽ chạy tiếp.',
          messageId
        );
        return true;
      }
      await this.notify(
        chatId,
        '❗ A đã xong — hãy chọn còn/hết hạn hoặc tài khoản trên B (số/tên button).',
        messageId
      );
      return true;
    }

    if (!this.isAwaitingList(chatId)) return false;
    return this.startPhaseA(messageText, chatId, messageId);
  }

  /** Parse list → gửi hết Bot A → rồi mới mở Bot B */
  async startPhaseA(text, controlChatId, replyTo) {
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

    let peerA;
    try {
      peerA = await this.resolvePeer(this.getBotA());
    } catch (e) {
      await this.notify(controlChatId, `❌ Bot A: ${e.message}`, replyTo);
      return true;
    }

    const session = this.getSession(controlChatId) || {};
    // Giữ TK B / peer để batch sau không hỏi lại
    const keepB = {
      chosenAccount: session.chosenAccount,
      chosenAccountFilter: session.chosenAccountFilter,
      peer: session.peer,
      peerCfg: session.peerCfg,
      listMsg: session.listMsg,
      lastMsg: session.lastMsg,
      totalSentA: session.totalSentA || 0,
      queuedText: session.queuedText,
    };
    session.phase = 'sending_a';
    session.peerA = peerA;
    session.items = items;
    session.replyTo = replyTo || session.replyTo;
    session.controlChatId = String(controlChatId);
    session.cancel = false;
    session.stats = emptyStats();
    Object.assign(session, keepB);
    this.sessions.set(String(controlChatId), session);

    const nCong = items.filter((i) => i.kind === 'cong').length;
    const nTru = items.filter((i) => i.kind === 'tru').length;
    await this.notify(
      controlChatId,
      [
        `🚀 WF4 pha A: gửi ${items.length} lệnh /bdsd → \`${this.getBotA()}\``,
        `(Cộng ${nCong} · Trừ ${nTru}) — xong A mới sang B.`,
      ].join('\n'),
      replyTo
    );

    this.runSendAllToA(controlChatId).catch(async (err) => {
      this.clearSession(controlChatId);
      await this.notify(controlChatId, `❌ WF4 lỗi A: ${err.message}`, replyTo);
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
    Utils.log(`${this.label} click Trừ tiền: ${truBtn.text}`);
    msg = await this.clickButton(msg, truBtn.text, peer);
    await sleep(1200);
    // Bot thường edit tin tại chỗ — lấy lại tin chi tiết mới nhất
    msg = (await this.findDetailMessage(peer)) || msg;
    let body = String(msg?.message || msg?.text || '');
    const info = bodyAmountInfo(body);
    if (info && info.sign !== '-') {
      Utils.log(
        `${this.label} sau Trừ chưa thấy sign=- (slice: ${body.slice(0, 100)})`
      );
    }
    return msg;
  }

  /** Tin chi tiết Sửa Giao Dịch gần nhất (có Quay lại). */
  async findDetailMessage(peer, limit = 12) {
    const msgs = await this.bot.client.getMessages(peer, { limit });
    for (const m of msgs || []) {
      const body = String(m?.message || m?.text || '');
      if (!/S[uử]a\s*Giao\s*D[iị]ch\s*#/i.test(body)) continue;
      const flat = await this.getButtons(m);
      if (findButton(flat, BTN.back)) return m;
    }
    return null;
  }

  async messageHasTimeButton(msg) {
    const flat = await this.getButtons(msg);
    return flat.some(
      (b) =>
        /th[oờ]i\s*gian/i.test(b.text) &&
        !/ng[uư][oờ]i|s[oố]\s*ti[eề]n|n[oộ]i\s*dung/i.test(b.text)
    );
  }

  /**
   * Sau đổi Trừ: Quay lại một lần, rồi vào lại màn có Sửa Thời Gian.
   * Ưu tiên còn ở chi tiết; nếu về list thì mở lại GD (khớp mã GD/số tiền).
   */
  async afterFlipBackThenReopenForTime(detailMsg, peer, fields, page, session) {
    let msg = detailMsg || (await this.findDetailMessage(peer));
    const flat0 = await this.getButtons(msg);
    const backBtn = findButton(flat0, BTN.back);
    if (backBtn) {
      Utils.log(`${this.label} sau Trừ → Quay lại: ${backBtn.text}`);
      msg = await this.clickButton(msg, backBtn.text, peer);
      await sleep(1000);
    }

    // Có thể vẫn là chi tiết (tin edit) hoặc đã về list
    let detail = await this.findDetailMessage(peer);
    if (detail && (await this.messageHasTimeButton(detail))) {
      const body = String(detail.message || detail.text || '');
      if (this.detailMatchesItem(body, fields) || /tr[uừ]\s*ti[eề]n/i.test(body)) {
        Utils.log(`${this.label} sau Quay lại vẫn ở chi tiết — sửa giờ tại đây`);
        return { detail, body, page };
      }
    }

    // Về list → mở lại đúng GD mới nhất khớp
    msg = detail || msg;
    try {
      msg = await this.ensureTxList(msg, peer);
    } catch (_e) {
      msg = (await this.findTxListMessage(peer)) || (await this.getLatestMessage(peer));
    }
    const nav = await this.goToTxPage(msg, peer, page || 1);
    session.listMsg = nav.msg;
    session.lastMsg = nav.msg;

    const found = await this.findAndOpenItemOnB(
      session,
      fields,
      session.controlChatId
    );
    if (!found) {
      throw new Error(
        'Sau đổi Trừ + Quay lại, không mở lại được GD để sửa thời gian'
      );
    }
    return found;
  }

  detailMatchesItem(body, fields) {
    if (!/S[uử]a\s*Giao\s*D[iị]ch\s*#/i.test(body)) return false;
    const info = bodyAmountInfo(body);
    if (!info || !fields.amountDigits) return false;
    if (info.digits !== fields.amountDigits) return false;
    const raw = String(body || '');
    // Ưu tiên mã GD trong nội dung (STK trong /bdsd thường ≠ STK trên chi tiết)
    const needle = contentNeedle(fields.content);
    if (needle && raw.toLowerCase().includes(String(needle).toLowerCase())) {
      return true;
    }
    if (fields.content) {
      const chunk = fields.content.replace(/^GD\s*:\s*/i, '').slice(0, 28);
      if (chunk && raw.toLowerCase().includes(chunk.toLowerCase())) return true;
    }
    if (fields.stk && raw.includes(fields.stk)) return true;
    // Chỉ khớp tiền khi không có mã để siết — tránh nhầm GD cùng số tiền
    return !needle;
  }

  /** Giờ từ Nội dung chi tiết, fallback từ dòng /bdsd gốc. */
  resolveContentTime(body, fields) {
    return (
      extractContentTime(body, false) ||
      (fields?.content ? extractContentTime(fields.content, false) : null) ||
      (fields?.content
        ? extractContentTime(`Nội dung: ${fields.content}`, false)
        : null)
    );
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

  /** Pha 1: gửi hết /bdsd lên A, xong mới mở B */
  async runSendAllToA(controlChatId) {
    const session = this.getSession(controlChatId);
    if (!session || session.phase !== 'sending_a') return;
    const { items, replyTo } = session;
    const total = items.length;

    for (let i = 0; i < items.length; i++) {
      const s = this.getSession(controlChatId);
      if (!s || s.cancel || s.phase !== 'sending_a') {
        await this.notify(controlChatId, '🛑 WF4 đã hủy (pha A).', replyTo);
        this.clearSession(controlChatId);
        return;
      }

      const item = items[i];
      const preview =
        item.line.length > 100 ? item.line.slice(0, 97) + '…' : item.line;
      const tag = item.kind === 'tru' ? 'Trừ' : 'Cộng';

      try {
        const sentOk = await this.sendBdsdToA(s, item.line, controlChatId);
        await this.notify(
          controlChatId,
          sentOk
            ? `✅ A [${i + 1}/${total}] ${tag}\n\`${preview}\``
            : `⚠️ A [${i + 1}/${total}] ${tag} đã gửi, chưa thấy reply\n\`${preview}\``,
          replyTo
        );
      } catch (e) {
        s.stats.errors += 1;
        await this.notify(
          controlChatId,
          `❌ A [${i + 1}/${total}] ${e.message}\n\`${preview}\``,
          replyTo
        );
      }

      if (i < items.length - 1) await sleep(this.gapMs);
    }

    const s = this.getSession(controlChatId);
    if (!s || s.cancel) {
      this.clearSession(controlChatId);
      await this.notify(controlChatId, '🛑 WF4 đã hủy sau pha A.', replyTo);
      return;
    }

    s.totalSentA = (s.totalSentA || 0) + (s.stats.sentA || 0);

    await this.notify(
      controlChatId,
      [
        `🏁 Pha A xong: gửi ${s.stats.sentA || 0}/${total} · lỗi ${s.stats.errors || 0}`,
        s.chosenAccount
          ? `➡️ Sang B (TK: ${s.chosenAccount})…`
          : `➡️ Sang Bot B (\`${this.getBotB()}\`) — chọn TK…`,
      ].join('\n'),
      replyTo
    );

    try {
      if (s.chosenAccount && s.peer) {
        await this.resumeEditOnB(controlChatId);
      } else {
        await this.runUntilAccountPick(controlChatId, replyTo);
      }
    } catch (err) {
      await this.notify(controlChatId, `❌ WF4 lỗi mở B: ${err.message}`, replyTo);
      await this.returnToAwaitList(controlChatId, null);
    }
  }

  /** Pha 2: trên B — flip Trừ + sửa giờ (không gửi A nữa) */
  async runEditAllOnB(controlChatId) {
    const session = this.getSession(controlChatId);
    if (!session || session.phase !== 'editing_b') return;
    const { items, peer, replyTo } = session;
    const total = items.length;

    for (let i = 0; i < items.length; i++) {
      const s = this.getSession(controlChatId);
      if (!s || s.cancel || s.phase !== 'editing_b') {
        await this.notify(controlChatId, '🛑 WF4 đã hủy (pha B).', replyTo);
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
        `▶️ B [${i + 1}/${total}] ${tag}\n\`${preview}\``,
        replyTo
      );

      try {
        const found = await this.findAndOpenItemOnB(s, fields, controlChatId);
        if (!found) {
          s.stats.errors += 1;
          await sleep(this.gapMs);
          continue;
        }

        let { detail, body, page } = found;
        s.currentPage = page;

        if (item.kind === 'tru') {
          const info = bodyAmountInfo(body);
          if (info && info.sign === '-') {
            s.stats.skippedFlip += 1;
            await this.notify(
              controlChatId,
              `⏭️ B [${i + 1}] Đã là Trừ — bỏ qua đổi loại`,
              replyTo
            );
          } else {
            detail = await this.editTypeToTru(detail, peer);
            s.stats.flipped += 1;
            await this.notify(
              controlChatId,
              `✅ B [${i + 1}] Đã đổi → Trừ\n↩️ Quay lại rồi mở lại để sửa giờ…`,
              replyTo
            );
            // Bắt buộc Quay lại rồi vào lại GD trước khi sửa thời gian
            const reopened = await this.afterFlipBackThenReopenForTime(
              detail,
              peer,
              fields,
              page,
              s
            );
            detail = reopened.detail;
            body = reopened.body;
            page = reopened.page || page;
            s.currentPage = page;
          }
        }

        // Đảm bảo đang ở màn chi tiết có nút giờ trước khi sửa
        if (!(await this.messageHasTimeButton(detail))) {
          const d2 = await this.findDetailMessage(peer);
          if (d2) {
            detail = d2;
            body = String(detail.message || detail.text || '');
          }
        }

        const contentTime = this.resolveContentTime(body, fields);
        const fieldTime = extractFieldTime(body, false);
        const rawField = extractFieldTimeRaw(body);
        if (!contentTime) {
          await this.notify(
            controlChatId,
            `⚠️ B [${i + 1}] Không parse được giờ Nội dung — bỏ qua`,
            replyTo
          );
        } else if (shouldSkipTimeEdit(contentTime, fieldTime, rawField, false)) {
          s.stats.skippedTime += 1;
          await this.notify(
            controlChatId,
            `⏭️ B [${i + 1}] Giờ đã đúng (${contentTime})`,
            replyTo
          );
        } else {
          // Re-fetch detail ngay trước khi bấm Thời gian (tránh msg stale sau Trừ)
          const fresh = await this.findDetailMessage(peer);
          if (fresh) detail = fresh;
          detail = await this.editTimeOnDetail(detail, peer, contentTime);
          await sleep(800);
          detail = (await this.findDetailMessage(peer)) || detail;
          body = String(detail?.message || detail?.text || '');
          const rawAfter = extractFieldTimeRaw(body);
          const fieldAfter = extractFieldTime(body, false);
          if (!fieldMatchesTarget(rawAfter, fieldAfter, contentTime, false)) {
            const soft =
              fieldAfter &&
              contentTime &&
              fieldAfter.replace(/:\d{2}$/, '') ===
                contentTime.replace(/:\d{2}$/, '');
            if (!soft) {
              throw new Error(
                `Sau sửa giờ vẫn lệch: ${rawAfter || fieldAfter} (cần ${contentTime})`
              );
            }
          }
          s.stats.fixedTime += 1;
          await this.notify(
            controlChatId,
            `✅ B [${i + 1}] Giờ → ${contentTime}`,
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
          `❌ B [${i + 1}] ${e.message}`,
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
    await this.returnToAwaitList(controlChatId, [
      `🏁 Batch xong (${total} mục).`,
      `Gửi A (batch): ${st.sentA || 0}`,
      `Đổi Trừ: ${st.flipped || 0} (bỏ qua ${st.skippedFlip || 0})`,
      `Sửa giờ: ${st.fixedTime || 0} (đã đúng ${st.skippedTime || 0})`,
      `Lỗi: ${st.errors || 0}`,
    ]);
  }
}

module.exports = {
  Wf4Runner,
  extractWf4Items,
  looksLikeWf4List,
  parseBdsdFields,
  KIND_LINE_RE,
};
