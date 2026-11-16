/**
 * Workflow WF4 — chế độ ON liên tục đến /wf4 off.
 *
 * Luồng:
 * 1) /wf4 on → chờ dán list (chưa đụng B)
 * 2) Gửi hết /bdsd batch lên A
 * 3) Pha B = runAnnotatedListRepair (logic WF1 + /bdsd trên bot B)
 * 4) /phab hoặc /wf1+list → chỉ pha B (cùng path), không gửi A
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
  KIND_LINE_RE,
  extractAnnotatedItems: extractWf4Items,
  looksLikeAnnotatedList: looksLikeWf4List,
  parseBdsdFields,
  contentNeedle,
  listHasPhone: listHasPhoneForPhaseB,
} = require('./workflow-wf1');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    this.gapMs = 350;
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

  // —— Chỉ WF4: pager / sửa giờ (WF1 giữ bản hôm qua, không dùng các override này) ——

  findPagerPrev(flat) {
    const list = flat || [];
    return (
      list.find((b) =>
        /tr[uư][oớ]c|prev|before|trang\s*tr[uư][oớ]c|v[eề]\s*tr[uư][oớ]c/i.test(b.text)
      ) ||
      list.find((b) => /^\s*«\s*$/.test(b.text) || /^\s*‹\s*$/.test(b.text)) ||
      null
    );
  }

  findPagerNext(flat) {
    const list = flat || [];
    return (
      list.find((b) =>
        /ti[eế]p(\s*theo)?|next|sau|trang\s*sau|xem\s*th[eê]m|giao\s*d[iị]ch\s*ti[eế]p/i.test(
          b.text
        )
      ) ||
      list.find((b) => /^\s*»\s*$/.test(b.text) || /^\s*›\s*$/.test(b.text)) ||
      null
    );
  }

  async goToFirstTxPage(msg, peer) {
    msg = await this.ensureTxList(msg, peer);
    for (let i = 0; i < 20; i++) {
      const info = this.parseLsgdPage(msg);
      const cur = info?.page;
      if (cur === 1) {
        Utils.log(`${this.label} LSGD đã ở trang 1/${info.total || '?'}`);
        return msg;
      }
      const flat = await this.getButtons(msg);
      const prev = this.findPagerPrev(flat);
      if (!prev) {
        Utils.log(
          `${this.label} goToFirstTxPage: không còn nút Trước (page=${cur || '?'})`
        );
        break;
      }
      Utils.log(
        `${this.label} LSGD trang ${cur || '?'} → bấm Trước «${prev.text}» về trang 1`
      );
      msg = await this.clickButton(msg, prev.text, peer);
      await sleep(300);
      msg =
        (await this.findTxListMessage(peer)) ||
        (await this.getLatestMessage(peer)) ||
        msg;
    }
    return msg;
  }

  async goToTxPage(msg, peer, targetPage) {
    const target = Math.max(1, Number(targetPage) || 1);
    msg = await this.ensureTxList(msg, peer);
    for (let guard = 0; guard < 25; guard++) {
      const info = this.parseLsgdPage(msg);
      const cur = info?.page || 1;
      const total = info?.total || null;
      if (cur === target) return { msg, page: cur, total };
      if (total != null && target > total) return { msg, page: cur, total };
      const flat = await this.getButtons(msg);
      if (cur < target) {
        const next = this.findPagerNext(flat);
        if (!next) return { msg, page: cur, total };
        msg = await this.clickButton(msg, next.text, peer);
        await sleep(350);
        msg =
          (await this.findTxListMessage(peer)) ||
          (await this.getLatestMessage(peer)) ||
          msg;
        continue;
      }
      const prev = this.findPagerPrev(flat);
      if (!prev) return { msg, page: cur, total };
      msg = await this.clickButton(msg, prev.text, peer);
      await sleep(350);
      msg =
        (await this.findTxListMessage(peer)) ||
        (await this.getLatestMessage(peer)) ||
        msg;
    }
    const info = this.parseLsgdPage(msg);
    return { msg, page: info?.page || 1, total: info?.total || null };
  }

  async waitForUpdatedDetailTime(peer, targetTime, { beforeId = 0, oldTime = null } = {}) {
    let lastSeen = null;
    for (let i = 0; i < 10; i++) {
      const msgs = await this.getMessagesSafe(peer, { limit: 12 });
      for (const m of msgs || []) {
        if (!m || (beforeId && m.id <= beforeId)) continue;
        const body = String(m.message || m.text || '');
        if (!/S[uử]a\s*Giao\s*D[iị]ch\s*#/i.test(body)) continue;
        const flat = await this.getButtons(m);
        if (!findButton(flat, BTN.back)) continue;
        const raw = extractFieldTimeRaw(body);
        if (!raw) continue;
        const field = extractFieldTime(`Thời gian: ${raw}`, false);
        lastSeen = m;
        if (fieldMatchesTarget(raw, field, targetTime, false)) {
          Utils.log(
            `${this.label} chi tiết mới #${m.id}: Thời gian=${raw || field} (đúng ${targetTime})`
          );
          return m;
        }
        if (
          oldTime &&
          field &&
          field !== oldTime &&
          String(field).replace(/:\d{2}$/, '') ===
            String(targetTime).replace(/:\d{2}$/, '')
        ) {
          return m;
        }
      }
      await sleep(700);
    }
    return lastSeen;
  }

  // editTimeOnDetail: dùng bản WF1 (expectPrompt — không chờ keyboard khi nhập giờ)

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
    return (
      s &&
      (s.phase === 'sending_a' ||
        s.phase === 'editing_b' ||
        s.phase === 'processing' ||
        s.mode === 'annotated_list')
    );
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
          '`/phab` — chạy lại **chỉ pha B** (logic WF1 + /bdsd; không gửi A)',
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
              : 'Sau A bot tự tìm TK trên B theo SĐT (còn hạn → hết hạn).',
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

  /**
   * /phab — chạy lại chỉ pha B (Trừ + giờ), không gửi A.
   * Dùng list vừa lỗi (lastItems) hoặc list dán kèm lệnh.
   */
  async handlePhabCommand(rawText, chatId, messageId) {
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
        '⏳ WF4 đang xử lý — đợi xong hoặc `/wf4 off` rồi `/phab`.'
      );
      return;
    }

    let items = null;
    if (looksLikeWf4List(rawText)) {
      try {
        items = extractWf4Items(rawText);
      } catch (e) {
        await this.bot.sendReply(chatId, messageId, `❌ Format list: ${e.message}`);
        return;
      }
    }

    let session = this.getSession(chatId);
    if (!session) {
      session = {
        phase: 'await_list',
        replyTo: messageId,
        controlChatId: String(chatId),
        stats: emptyStats(),
        totalSentA: 0,
      };
      this.sessions.set(String(chatId), session);
    }

    if (!items || !items.length) {
      items = Array.isArray(session.lastItems) ? session.lastItems.slice() : [];
    }
    if (!items.length) {
      await this.bot.sendReply(
        chatId,
        messageId,
        [
          '❗ Không có list để chạy pha B.',
          'Cách dùng:',
          '• Sau lỗi batch: gõ `/phab` (dùng lại list vừa rồi)',
          '• Hoặc dán list kèm: `/phab` + `1. Cộng`/`Trừ` + `/bdsd …`',
        ].join('\n')
      );
      return;
    }

    session.replyTo = messageId || session.replyTo;
    session.controlChatId = String(chatId);
    session.cancel = false;
    session.items = items;
    session.lastItems = items.slice();
    session.stats = emptyStats();
    // Đánh dấu batch này không gửi A
    session.stats.sentA = 0;
    session.phabOnly = true;

    const nCong = items.filter((i) => i.kind === 'cong').length;
    const nTru = items.filter((i) => i.kind === 'tru').length;
    await this.notify(
      chatId,
      [
        `🔁 **/phab** — chỉ pha B, logic WF1 + /bdsd (${items.length} mục: Cộng ${nCong} · Trừ ${nTru})`,
        `B=\`${this.getBotB()}\` — **không** gửi A.`,
        session.chosenAccount
          ? `TK: ${session.chosenAccount}`
          : 'Chưa có TK — bot sẽ tự tìm theo SĐT.',
      ].join('\n'),
      messageId
    );

    this.runAnnotatedListRepair(chatId, items, messageId, {
      continuous: true,
      sentA: 0,
    }).catch(async (err) => {
      await this.notify(chatId, `❌ /phab lỗi: ${err.message}`, messageId);
      await this.returnToAwaitList(chatId, null);
    });
  }

  phonesFromSessionItems(session) {
    const phones = [];
    const seen = new Set();
    for (const it of session?.items || []) {
      const f = parseBdsdFields(it.line);
      const d = String(f.phone || '').replace(/\D/g, '');
      if (d && !seen.has(d)) {
        seen.add(d);
        phones.push(d);
      }
    }
    return phones;
  }

  accountMatchesPhones(btnText, phones) {
    const t = String(btnText || '');
    if (!phones?.length) return false;
    // Bỏ nút Quay lại
    if (BTN.back.test(t) || /quay\s*l[aạ]i/i.test(t)) return false;
    return phones.some((p) => p && t.includes(p));
  }

  /**
   * Mở B, tự chọn còn hạn → tìm TK cùng SĐT;
   * không thấy → Quay lại → hết hạn → tìm tiếp.
   */
  async runUntilAccountPick(controlChatId, replyTo) {
    const prev = this.getSession(controlChatId) || {};
    const saved = {
      items: prev.items || [],
      stats: prev.stats || emptyStats(),
      peerA: prev.peerA,
      replyTo: replyTo || prev.replyTo,
      totalSentA: prev.totalSentA || 0,
      queuedText: prev.queuedText,
      // Giữ TK đã chọn (nếu còn) — tránh /start lại khi vừa xài chung bot với WF1
      chosenAccount: prev.chosenAccount,
      chosenAccountFilter: prev.chosenAccountFilter,
      accountButtons: prev.accountButtons,
    };
    if (!saved.items.length) {
      throw new Error('Mất list sau pha A — hủy.');
    }

    const phones = this.phonesFromSessionItems({ items: saved.items });
    if (!phones.length) {
      throw new Error('Không lấy được SĐT từ list /bdsd để chọn tài khoản.');
    }

    const peerCfg = this.getBotPeerConfig();
    const peer = await this.resolvePeer(peerCfg);
    this.sessions.set(String(controlChatId), {
      phase: 'processing',
      peerCfg,
      peer,
      controlChatId: String(controlChatId),
      replyTo: saved.replyTo,
      items: saved.items,
      stats: saved.stats,
      peerA: saved.peerA,
      totalSentA: saved.totalSentA,
      queuedText: saved.queuedText,
      chosenAccount: saved.chosenAccount,
      chosenAccountFilter: saved.chosenAccountFilter,
      accountButtons: saved.accountButtons,
      cancel: false,
    });

    await this.notify(
      controlChatId,
      `📤 Bot B: tìm TK khớp SĐT \`${phones.join(', ')}\`…`,
      saved.replyTo
    );

    // Nếu vừa chọn TK cùng SĐT (vd WF1/phab trước đó) → vào lại LSGD, khỏi /start
    if (
      saved.chosenAccount &&
      this.accountMatchesPhones(saved.chosenAccount, phones)
    ) {
      await this.notify(
        controlChatId,
        `♻️ Dùng lại TK: ${saved.chosenAccount}`,
        saved.replyTo
      );
      try {
        const msg = await this.openEditTxAfterAccount(controlChatId);
        const session = this.getSession(controlChatId);
        session.lastMsg = msg;
        session.listMsg = msg;
        session.phase = 'editing_b';
        this.runEditAllOnB(controlChatId).catch(async (err) => {
          await this.notify(
            controlChatId,
            `❌ WF4 lỗi B: ${err.message}`,
            saved.replyTo
          );
          await this.returnToAwaitList(controlChatId, null);
        });
        return;
      } catch (e) {
        Utils.log(`${this.label} reuse TK fail: ${e.message} — /start lại`);
      }
    }

    let msg = await this.startAndClickFirstTwo(peer, controlChatId, saved.replyTo);

    const flatFilters = await this.getButtons(msg);
    const filterBtns = flatFilters.filter((b) => BTN.accountFilter.test(b.text));
    if (!filterBtns.length) {
      throw new Error(
        `Không thấy còn hạn/hết hạn. Buttons: ${flatFilters.map((b) => b.text).join(' | ') || '(không)'}`
      );
    }

    // Ưu tiên còn hạn trước, rồi hết hạn
    const ordered = [...filterBtns].sort((a, b) => {
      const score = (t) => (/c[oò]n\s*h[aạ]n/i.test(t) ? 0 : /h[eế]t\s*h[aạ]n/i.test(t) ? 1 : 2);
      return score(a.text) - score(b.text);
    });

    const session = this.getSession(controlChatId);
    session.lastMsg = msg;

    for (let fi = 0; fi < ordered.length; fi++) {
      const filterBtn = ordered[fi];
      await this.notify(
        controlChatId,
        `🔎 Thử «${filterBtn.text}» — tìm SĐT ${phones.join(', ')}…`,
        saved.replyTo
      );

      msg = session.lastMsg || (await this.getLatestMessage(peer));
      // Đảm bảo đang ở màn filter (lần 2 sau Quay lại)
      const flatNow = await this.getButtons(msg);
      const onFilter = flatNow.some((b) => BTN.accountFilter.test(b.text));
      if (!onFilter) {
        // Thử Quay lại về filter
        const back = findButton(flatNow, BTN.back);
        if (back) {
          msg = await this.clickButton(msg, back.text, peer);
          await sleep(700);
        }
      }

      msg = await this.clickButton(msg, filterBtn.text, peer);
      await sleep(800);
      const flatAcc = await this.getButtons(msg);
      const accountBtns = flatAcc.filter(
        (b) => !BTN.back.test(b.text) && !BTN.accountFilter.test(b.text)
      );
      const match = accountBtns.find((b) =>
        this.accountMatchesPhones(b.text, phones)
      );

      if (match) {
        session.chosenAccountFilter = filterBtn.text;
        session.chosenAccount = match.text;
        session.lastMsg = msg;
        session.accountButtons = accountBtns.map((b, i) => ({
          index: i,
          text: b.text,
          row: b.row,
          col: b.col,
        }));
        await this.notify(
          controlChatId,
          `✅ ${filterBtn.text}\n→ TK: ${match.text}`,
          saved.replyTo
        );
        await this.continueAfterAccount(controlChatId);
        return;
      }

      await this.notify(
        controlChatId,
        `⚠️ «${filterBtn.text}» không có TK SĐT ${phones.join(', ')}`,
        saved.replyTo
      );

      // Quay lại để thử filter còn lại
      const backBtn = findButton(flatAcc, BTN.back) || findButton(await this.getButtons(msg), BTN.back);
      if (backBtn && fi < ordered.length - 1) {
        msg = await this.clickButton(msg, backBtn.text, peer);
        await sleep(800);
        session.lastMsg = msg;
      }
    }

    throw new Error(
      `Không tìm thấy tài khoản cùng SĐT ${phones.join(', ')} ở còn hạn lẫn hết hạn.`
    );
  }

  /** Còn đang ở list TK (chưa vào menu sau khi chọn TK). */
  isAccountListScreen(flat) {
    const list = flat || [];
    if (!list.length) return false;
    if (list.some((b) => BTN.editTx.test(b.text) || BTN.editTxMenu.test(b.text))) {
      return false;
    }
    const accounts = list.filter(
      (b) =>
        !BTN.back.test(b.text) &&
        !BTN.accountFilter.test(b.text) &&
        /\|\s*[A-Z]{2,}/.test(b.text)
    );
    return accounts.length > 0;
  }

  /** Bấm TK theo row/col đã lưu (ổn định hơn so với text dài). */
  async clickChosenAccount(msg, peer, session) {
    const chosen = session.chosenAccount;
    const stored = (session.accountButtons || []).find((b) => b.text === chosen);
    const flat = await this.getButtons(msg);
    if (stored && Number.isInteger(stored.row) && Number.isInteger(stored.col)) {
      const at = flat.find((b) => b.row === stored.row && b.col === stored.col);
      if (at && at.text === chosen) {
        Utils.log(
          `${this.label} click TK theo vị trí [${stored.row},${stored.col}]: ${chosen}`
        );
        return this.clickAt(msg, stored.row, stored.col, peer);
      }
    }
    const byText = findButton(flat, chosen);
    if (byText) {
      return this.clickAt(msg, byText.row, byText.col, peer);
    }
    // Fallback: khớp SĐT trong list hiện tại
    const phones = this.phonesFromSessionItems(session);
    const soft = flat.find((b) => this.accountMatchesPhones(b.text, phones));
    if (soft) {
      Utils.log(`${this.label} click TK soft-match: ${soft.text}`);
      session.chosenAccount = soft.text;
      return this.clickAt(msg, soft.row, soft.col, peer);
    }
    throw new Error(
      `Không tìm thấy button TK.\nHiện có:\n${flat.map((b, i) => `${i + 1}. ${b.text}`).join('\n') || '(không có)'}`
    );
  }

  /**
   * Sau khi đã biết TK: bấm TK → chờ menu → Chỉnh sửa (nếu có) → Chỉnh Giao Dịch.
   * BankAo đôi khi chậm cập nhật keyboard; phải poll/retry thay vì bấm edit ngay.
   */
  async openEditTxAfterAccount(controlChatId, msg) {
    const session = this.getSession(controlChatId);
    if (!session) throw new Error('Mất session khi mở chỉnh GD trên B');
    const { peer, replyTo } = session;

    msg = msg || session.lastMsg || (await this.getLatestMessage(peer));
    let flat = await this.getButtons(msg);

    // Đã sẵn menu chỉnh thì khỏi bấm lại TK
    if (!findButton(flat, BTN.editTx) && !findButton(flat, BTN.editTxMenu)) {
      await this.notify(
        controlChatId,
        `👆 Chọn TK: ${session.chosenAccount}`,
        replyTo
      );
      for (let attempt = 1; attempt <= 4; attempt++) {
        msg = await this.clickChosenAccount(msg, peer, session);
        await sleep(900);
        // Ưu tiên tin có keyboard mới (bot hay edit cùng msg)
        msg =
          (await this.findMessageWithButtons(peer, (m, f) =>
            !!(findButton(f, BTN.editTx) || findButton(f, BTN.editTxMenu) || this.isAccountListScreen(f))
          )) ||
          (await this.getLatestMessage(peer)) ||
          msg;
        flat = await this.getButtons(msg);
        if (findButton(flat, BTN.editTx) || findButton(flat, BTN.editTxMenu)) break;
        if (this.isAccountListScreen(flat) && attempt < 4) {
          Utils.log(
            `${this.label} sau click TK vẫn list TK (lần ${attempt}) — thử lại`
          );
          await sleep(700);
          continue;
        }
        break;
      }
    }

    flat = await this.getButtons(msg);
    if (findButton(flat, BTN.editTxMenu)) {
      await this.notify(controlChatId, '👆 Chỉnh sửa giao dịch…', replyTo);
      msg = await this.clickButton(msg, BTN.editTxMenu, peer);
      await sleep(800);
      msg = (await this.getLatestMessage(peer)) || msg;
      flat = await this.getButtons(msg);
    }

    // Chờ nút Chỉnh Giao Dịch xuất hiện (keyboard cập nhật chậm)
    for (let i = 0; i < 6; i++) {
      flat = await this.getButtons(msg);
      if (findButton(flat, BTN.editTx)) break;
      const found = await this.findMessageWithButtons(peer, (_m, f) =>
        !!findButton(f, BTN.editTx)
      );
      if (found) {
        msg = found;
        break;
      }
      await sleep(700);
      msg = (await this.getLatestMessage(peer)) || msg;
    }

    flat = await this.getButtons(msg);
    if (!findButton(flat, BTN.editTx)) {
      throw new Error(
        `Không tìm thấy button Chỉnh Giao Dịch sau khi chọn TK.\nHiện có:\n${flat.map((b, i) => `${i + 1}. ${b.text}`).join('\n') || '(không có)'}`
      );
    }

    await this.notify(controlChatId, '👆 Chỉnh giao dịch…', replyTo);
    msg = await this.clickButton(msg, BTN.editTx, peer);
    await sleep(1000);
    msg = (await this.ensureTxList(msg, peer)) || msg;
    return msg;
  }

  async findMessageWithButtons(peer, pred, limit = 12) {
    const msgs = await this.getMessagesSafe(peer, { limit });
    for (const m of msgs || []) {
      if (!m) continue;
      const flat = await this.getButtons(m);
      if (!flat.length) continue;
      if (pred(m, flat)) return m;
    }
    return null;
  }

  /** Đã có TK B từ batch trước → vào lại LSGD; SĐT khác thì chọn lại */
  async resumeEditOnB(controlChatId) {
    const session = this.getSession(controlChatId);
    if (!session || !session.peer || !session.chosenAccount) {
      await this.runUntilAccountPick(controlChatId, session?.replyTo);
      return;
    }
    const phones = this.phonesFromSessionItems(session);
    if (
      phones.length &&
      !this.accountMatchesPhones(session.chosenAccount, phones)
    ) {
      await this.notify(
        controlChatId,
        `🔄 SĐT batch mới khác TK cũ — chọn lại TK…`,
        session.replyTo
      );
      await this.runUntilAccountPick(controlChatId, session.replyTo);
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
      try {
        msg = await this.openEditTxAfterAccount(
          controlChatId,
          await this.getLatestMessage(peer)
        );
      } catch (_e2) {
        await this.runUntilAccountPick(controlChatId, replyTo);
        return;
      }
    }

    session.lastMsg = msg;
    session.listMsg = msg;
    session.phase = 'editing_b';
    this.runEditAllOnB(controlChatId).catch(async (err) => {
      await this.notify(controlChatId, `❌ WF4 lỗi B: ${err.message}`, replyTo);
      await this.returnToAwaitList(controlChatId, null);
    });
  }

  /** Sau khi A xong + đã chọn TK: vào LSGD rồi chỉnh trên B */
  async continueAfterAccount(controlChatId) {
    const session = this.getSession(controlChatId);
    if (!session) return;
    const { replyTo } = session;

    const msg = await this.openEditTxAfterAccount(controlChatId);

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
    // Giữ list vừa chạy để `/phab` chạy lại chỉ pha B
    if (Array.isArray(s.items) && s.items.length) {
      s.lastItems = s.items.slice();
    }
    s.phase = 'await_list';
    s.items = [];
    s.cancel = false;

    if (summaryLines && summaryLines.length) {
      await this.notify(
        controlChatId,
        [
          ...summaryLines,
          '',
          '📥 WF4 vẫn **ON** — dán list/mục tiếp (hoặc `/wf4 off`).',
          'Lỗi pha B? Gõ `/phab` để chạy lại chỉ B (không gửi A).',
        ].join('\n'),
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
    const msgs = await this.getMessagesSafe(peer, { limit: 5 });
    return msgs && msgs[0] ? msgs[0].id : 0;
  }

  async waitForBotReply(peer, afterId, timeoutMs, controlChatId) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const s = this.getSession(controlChatId);
      if (!s || s.cancel) return null;
      const msgs = await this.getMessagesSafe(peer, { limit: 8 });
      if (msgs && msgs.length) {
        const newer = msgs.filter((m) => m && m.id > afterId && !m.out);
        if (newer.length) return newer.reduce((a, b) => (a.id > b.id ? a : b));
      }
      await sleep(500);
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

  /** Màn xác nhận sau bấm Trừ: "Đã đổi loại… Trừ tiền" + nút Quay lại */
  isFlipConfirmScreen(msg) {
    const body = String(msg?.message || msg?.text || '');
    return (
      /đ[ãa]\s*đ[oổ]i\s*lo[aạ]i\s*giao\s*d[iị]ch\s*th[aà]nh\s*tr[uừ]/i.test(body) ||
      (/đ[oổ]i\s*lo[aạ]i/i.test(body) && /tr[uừ]\s*ti[eề]n/i.test(body) && /s[oố]\s*d[uư]/i.test(body))
    );
  }

  async findFlipConfirmMessage(peer, limit = 10) {
    const msgs = await this.getMessagesSafe(peer, { limit });
    for (const m of msgs || []) {
      if (this.isFlipConfirmScreen(m)) return m;
    }
    return null;
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
    await sleep(400);

    // Chờ màn "Đã đổi loại giao dịch thành Trừ tiền… Quay lại"
    for (let i = 0; i < 8; i++) {
      const confirm =
        (await this.findFlipConfirmMessage(peer)) ||
        (this.isFlipConfirmScreen(await this.getLatestMessage(peer))
          ? await this.getLatestMessage(peer)
          : null);
      if (confirm) {
        Utils.log(
          `${this.label} màn xác nhận Trừ: ${String(confirm.message || confirm.text || '').slice(0, 80)}`
        );
        return confirm;
      }
      await sleep(300);
    }
    Utils.log(`${this.label} không thấy màn xác nhận Trừ — dùng latest`);
    return (await this.getLatestMessage(peer)) || msg;
  }

  /** Tin chi tiết Sửa Giao Dịch gần nhất (có Quay lại). */
  async findDetailMessage(peer, limit = 12) {
    const msgs = await this.getMessagesSafe(peer, { limit });
    for (const m of msgs || []) {
      const body = String(m?.message || m?.text || '');
      if (!/S[uử]a\s*Giao\s*D[iị]ch\s*#/i.test(body)) continue;
      if (this.isFlipConfirmScreen(m)) continue;
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
   * Sau đổi Trừ: màn xác nhận → Quay lại → về chi tiết → Sửa Thời Gian.
   * (Không mở list trừ khi Quay lại đưa về list.)
   */
  async afterFlipBackThenReopenForTime(confirmMsg, peer, fields, page, session) {
    let msg =
      confirmMsg ||
      (await this.findFlipConfirmMessage(peer)) ||
      (await this.getLatestMessage(peer));

    // Đảm bảo đang ở màn xác nhận (chỉ Quay lại)
    if (!this.isFlipConfirmScreen(msg)) {
      const c = await this.findFlipConfirmMessage(peer);
      if (c) msg = c;
    }

    const flat0 = await this.getButtons(msg);
    const backBtn = findButton(flat0, BTN.back);
    if (!backBtn) {
      throw new Error(
        `Sau đổi Trừ không thấy nút Quay lại. Body: ${String(msg?.message || msg?.text || '').slice(0, 120)}`
      );
    }
    Utils.log(`${this.label} màn xác nhận Trừ → Quay lại: ${backBtn.text}`);
    msg = await this.clickButton(msg, backBtn.text, peer);
    await sleep(300);

    // Về màn chi tiết Sửa Giao Dịch (đã là Trừ) có nút Sửa Thời Gian
    for (let i = 0; i < 6; i++) {
      let detail = await this.findDetailMessage(peer);
      if (!detail) {
        detail = await this.getLatestMessage(peer);
      }
      if (detail && (await this.messageHasTimeButton(detail))) {
        const body = String(detail.message || detail.text || '');
        const info = bodyAmountInfo(body);
        if (
          /S[uử]a\s*Giao\s*D[iị]ch\s*#/i.test(body) &&
          (this.detailMatchesItem(body, fields) ||
            (info && info.sign === '-') ||
            /tr[uừ]\s*ti[eề]n/i.test(body))
        ) {
          Utils.log(
            `${this.label} sau Quay lại → chi tiết sẵn sàng sửa giờ (#${detail.id})`
          );
          return { detail, body, page };
        }
      }
      await sleep(300);
    }

    // Fallback: về list trang 1 rồi mở lại GD
    Utils.log(`${this.label} sau Quay lại chưa ra chi tiết — mở lại từ list`);
    try {
      msg = await this.ensureTxList(msg, peer);
    } catch (_e) {
      msg = (await this.findTxListMessage(peer)) || (await this.getLatestMessage(peer));
    }
    msg = await this.goToFirstTxPage(msg, peer);
    const nav = await this.goToTxPage(msg, peer, 1);
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
    // GD mới thường ở trang 1 — bấm Trước đến 1/N trước khi quét
    msg = await this.goToFirstTxPage(msg, peer);
    msg = await this.ensureTxList(msg, peer);
    const startInfo = this.parseLsgdPage(msg);
    Utils.log(
      `${this.label} tìm GD ${fields.amountDigits || '?'} từ trang ${startInfo?.page || '?'}/${startInfo?.total || '?'}`
    );
    if (startInfo && startInfo.page !== 1) {
      await this.notify(
        controlChatId,
        `↩️ Đang về trang 1 LSGD (hiện ${startInfo.page}/${startInfo.total})…`,
        replyTo
      );
      msg = await this.goToFirstTxPage(msg, peer);
    }

    let page = 1;
    let knownTotal = this.parseLsgdPage(msg)?.total || null;
    const maxPages = knownTotal || 20;

    for (let p = 0; p < maxPages; p++) {
      const nav = await this.goToTxPage(msg, peer, page);
      msg = nav.msg;
      page = nav.page || page;
      if (nav.total) knownTotal = nav.total;
      Utils.log(`${this.label} quét LSGD trang ${page}/${knownTotal || '?'}`);

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
        // Nới: cùng số tiền + giờ Nội dung khớp /bdsd, hoặc GD mới ở trang 1
        const info = bodyAmountInfo(body);
        if (info && fields.amountDigits && info.digits === fields.amountDigits) {
          const wantT = this.resolveContentTime('', fields);
          const gotT = extractContentTime(body, false);
          if ((wantT && gotT && wantT === gotT) || page === 1) {
            Utils.log(
              `${this.label} nhận GD soft-match tiền ${fields.amountDigits} (trang ${page}, time ${gotT || '?'})`
            );
            return { detail, body, page, msg };
          }
        }
        msg = await this.returnToTransactionList(detail, peer, { afterEdit: false });
        // Sau Quay lại bot về trang 1 — nhảy lại trang đang quét
        const backNav = await this.goToTxPage(msg, peer, page);
        msg = backNav.msg;
      }

      if (knownTotal != null && page >= knownTotal) break;
      flat = await this.getButtons(msg);
      const nextBtn = this.findPagerNext(flat);
      if (!nextBtn) break;
      const before = this.parseLsgdPage(msg)?.page || page;
      msg = await this.clickButton(msg, nextBtn.text, peer);
      await sleep(350);
      msg = (await this.findTxListMessage(peer)) || (await this.getLatestMessage(peer)) || msg;
      const after = this.parseLsgdPage(msg);
      if (!after || after.page <= before) break;
      page = after.page;
      if (after.total) knownTotal = after.total;
    }

    await this.notify(
      controlChatId,
      `⚠️ Không thấy GD khớp tiền ${fields.amountDigits || '?'} trên bot B (đã về trang 1 rồi quét).`,
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

    const sentA = s.stats.sentA || 0;
    await this.notify(
      controlChatId,
      [
        `🏁 Pha A xong: gửi ${sentA}/${total} · lỗi ${s.stats.errors || 0}`,
        `➡️ Pha B: logic WF1 + /bdsd trên \`${this.getBotB()}\`…`,
        s.chosenAccount ? `TK: ${s.chosenAccount}` : 'Tự chọn TK theo SĐT (còn hạn → hết hạn).',
      ].join('\n'),
      replyTo
    );

    // Pha B = cùng logic WF1 sửa list (Trừ + giờ), bot B
    this.runAnnotatedListRepair(controlChatId, s.items, replyTo, {
      continuous: true,
      sentA,
    }).catch(async (err) => {
      await this.notify(controlChatId, `❌ WF4 lỗi pha B: ${err.message}`, replyTo);
      await this.returnToAwaitList(controlChatId, null);
    });
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
            const confirmMsg = await this.editTypeToTru(detail, peer);
            s.stats.flipped += 1;
            await this.notify(
              controlChatId,
              `✅ B [${i + 1}] Đã đổi → Trừ\n↩️ Quay lại → Sửa Thời Gian…`,
              replyTo
            );
            // Màn xác nhận → Quay lại → chi tiết → sửa giờ
            const reopened = await this.afterFlipBackThenReopenForTime(
              confirmMsg,
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
          const beforeEditId = detail?.id || 0;
          const oldTime =
            extractFieldTime(String(detail?.message || detail?.text || ''), false) ||
            null;
          detail = await this.editTimeOnDetail(detail, peer, contentTime);
          // editTimeOnDetail đã Quay lại tin mới nhất để commit giờ
          const okTime = (raw, field) =>
            fieldMatchesTarget(raw, field, contentTime, false) ||
            (field &&
              contentTime &&
              field.replace(/:\d{2}$/, '') === contentTime.replace(/:\d{2}$/, ''));

          let rawAfter = extractFieldTimeRaw(
            String(detail?.message || detail?.text || '')
          );
          let fieldAfter = extractFieldTime(
            String(detail?.message || detail?.text || ''),
            false
          );

          if (!okTime(rawAfter, fieldAfter)) {
            detail =
              (await this.waitForUpdatedDetailTime(peer, contentTime, {
                beforeId: beforeEditId,
                oldTime,
              })) || detail;
            body = String(detail?.message || detail?.text || '');
            rawAfter = extractFieldTimeRaw(body);
            fieldAfter = extractFieldTime(body, false);
          }

          // Sau Quay lại có thể về list — mở lại GD để xác nhận giờ mới
          if (!okTime(rawAfter, fieldAfter)) {
            await sleep(400);
            const recheck = await this.findAndOpenItemOnB(s, fields, controlChatId);
            if (recheck) {
              detail = recheck.detail;
              body = recheck.body;
              page = recheck.page || page;
              s.currentPage = page;
              rawAfter = extractFieldTimeRaw(body);
              fieldAfter = extractFieldTime(body, false);
            }
          }

          if (!okTime(rawAfter, fieldAfter)) {
            throw new Error(
              `Sau sửa giờ vẫn lệch: ${rawAfter || fieldAfter} (cần ${contentTime})`
            );
          }
          body = String(detail?.message || detail?.text || body || '');
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
