/**
 * Workflow WF1 — điều khiển bot Telegram khác qua inline/reply keyboard.
 *
 * Cấu hình: /wf1bot|/wfbot @bot
 * Chạy: /wf1 on
 * (WF2 — gửi /bdsd — xem workflow-wf2.js)
 *
 * Luồng:
 * 1) /start → bấm button đầu → button thứ 2 → "tài khoản còn hạn"
 * 2) Liệt kê button tài khoản → user chọn
 * 3) "chỉnh sửa giao dịch" → "chỉnh giao dịch"
 * 4) Lặp từng giao dịch: so sánh thời gian trong Nội dung vs mục thời gian;
 *    trùng → bỏ qua; khác → chỉnh thời gian theo Nội dung; báo cáo về chat.
 */

const { Api } = require('telegram');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BTN = {
  accountValid: /t[aà]i\s*kho[aả]n\s*c[oò]n\s*h[aạ]n/i,
  // Một số bot: "Chỉnh sửa giao dịch"; bot này: "✏️ Chỉnh Giao Dịch"
  editTxMenu: /ch[iỉ]nh\s*s[uử]a\s*giao\s*d[iị]ch/i,
  editTx: /ch[iỉ]nh\s*giao\s*d[iị]ch/i,
  editTime: /th[oờ]i\s*gian|ch[iỉ]nh.*gi[oờ]|s[uử]a.*th[oờ]i/i,
  // Chỉ nhận diện nút quay lại rõ ràng (tránh khớp nhầm field khác)
  back: /quay\s*l[aạ]i|^back$|«|‹|⬅️/i,
  backLoose: /quay\s*l[aạ]i|back|h[uủ]y|cancel|«|‹|⬅️/i,
  // Button sang loạt giao dịch tiếp theo / trang trước
  nextPage:
    /ti[eế]p(\s*theo)?|next|sau|trang\s*sau|»|›|➡️|xem\s*th[eê]m|giao\s*d[iị]ch\s*ti[eế]p/i,
  prevPage:
    /tr[uư][oớ]c|prev|before|trang\s*tr[uư][oớ]c|«|‹|⬅️|v[eề]\s*tr[uư][oớ]c/i,
};

/**
 * Formats trong Nội dung / Thời gian:
 * - Compact: 151126-18:34:26 → DDMMYY + giờ (15/11/2026 18:34) — không dùng giây khi chỉnh
 * - Thường: 15/11/2026 18:34:26 hoặc 15/11/2026 18:34
 */
const DT_SLASH_RE =
  /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?)/;
/** DDMMYY-HH:mm[:ss] ví dụ 151126-18:34:26 */
const DT_COMPACT_RE = /(\d{2})(\d{2})(\d{2})-(\d{1,2}:\d{2}(?::\d{2})?)/;

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Chuẩn hóa để so sánh / gửi chỉnh sửa — không có giây */
function formatEditTime(day, month, year, hh, mm) {
  return `${pad2(day)}/${pad2(month)}/${year} ${pad2(hh)}:${pad2(mm)}`;
}

function parseTimePart(timePart) {
  const [hh, mm, ss] = String(timePart).split(':');
  return {
    hh: parseInt(hh, 10),
    mm: parseInt(mm, 10),
    ss: ss != null ? parseInt(ss, 10) : 0,
  };
}

function parseSlashDateTime(datePart, timePart) {
  const d = datePart.replace(/[.\-]/g, '/');
  const [a, b, c] = d.split('/');
  let day;
  let month;
  let year;
  if (String(c).length === 4) {
    day = parseInt(a, 10);
    month = parseInt(b, 10);
    year = c;
  } else if (String(a).length === 4) {
    year = a;
    month = parseInt(b, 10);
    day = parseInt(c, 10);
  } else {
    day = parseInt(a, 10);
    month = parseInt(b, 10);
    year = c.length === 2 ? `20${c}` : c;
  }
  const t = parseTimePart(timePart);
  return formatEditTime(day, month, year, t.hh, t.mm);
}

/** 151126-18:34:26 → DD=15 MM=11 YY=26 → 15/11/2026 18:34 */
function parseCompactDateTime(match) {
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const yy = match[3];
  const year = yy.length === 2 ? `20${yy}` : yy;
  const t = parseTimePart(match[4]);
  return formatEditTime(day, month, year, t.hh, t.mm);
}

function parseAnyDateTimeInChunk(chunk) {
  const raw = String(chunk || '');
  const compact = raw.match(DT_COMPACT_RE);
  if (compact) return parseCompactDateTime(compact);
  const slash = raw.match(DT_SLASH_RE);
  if (slash) return parseSlashDateTime(slash[1], slash[2]);
  return null;
}

function extractDateTimeFromText(text, labelRe) {
  const raw = String(text || '');
  if (labelRe) {
    const m = raw.match(labelRe);
    if (m) {
      const chunk = m[1] || m[0];
      const parsed = parseAnyDateTimeInChunk(chunk);
      if (parsed) return parsed;
    }
  }
  // Ưu tiên compact trong toàn bộ text
  const compactAll = [...raw.matchAll(new RegExp(DT_COMPACT_RE.source, 'g'))];
  if (compactAll.length) return parseCompactDateTime(compactAll[0]);
  const slashAll = [...raw.matchAll(new RegExp(DT_SLASH_RE.source, 'g'))];
  if (slashAll.length) return parseSlashDateTime(slashAll[0][1], slashAll[0][2]);
  return null;
}

function extractContentTime(text) {
  return (
    extractDateTimeFromText(
      text,
      /n[oộ]i\s*dung\s*:\s*([^\n]+)/i
    ) || extractDateTimeFromText(text, null)
  );
}

function extractFieldTime(text) {
  return extractDateTimeFromText(
    text,
    /th[oờ]i\s*gian\s*:\s*([^\n]+)/i
  );
}

/** Lấy raw text sau "Thời gian:" để biết còn giây hay không */
function extractFieldTimeRaw(text) {
  const m = String(text || '').match(/th[oờ]i\s*gian\s*:\s*([^\n]+)/i);
  return m ? String(m[1]).trim() : '';
}

/**
 * Mục Thời gian còn giây? (18:34:26 hoặc ...-18:34:26)
 * → vẫn phải chỉnh dù ngày/giờ-phút đã khớp Nội dung.
 */
function fieldTimeHasSeconds(rawField) {
  const raw = String(rawField || '');
  if (/\d{1,2}:\d{2}:\d{2}/.test(raw)) return true;
  return false;
}

/** true = đã đúng format cuối (khớp Nội dung và không còn giây) → bỏ qua */
function shouldSkipTimeEdit(contentTime, fieldTime, rawField) {
  if (!contentTime || !fieldTime) return false;
  if (fieldTimeHasSeconds(rawField)) return false;
  return fieldTime === contentTime;
}

function flattenButtons(rows) {
  if (!rows) return [];
  const out = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const b = row[c];
      const text = b?.text || b?.button?.text || '';
      if (text) out.push({ row: r, col: c, text: String(text), button: b });
    }
  }
  return out;
}

function findButton(flat, predicate) {
  if (typeof predicate === 'number') return flat[predicate] || null;
  if (predicate instanceof RegExp) {
    return flat.find((b) => predicate.test(b.text)) || null;
  }
  const q = String(predicate).toLowerCase();
  return (
    flat.find((b) => b.text.toLowerCase() === q) ||
    flat.find((b) => b.text.toLowerCase().includes(q)) ||
    null
  );
}

class WfRunner {
  /**
   * @param {object} bot
   * @param {{ id?: string, label?: string }} [opts] id = wf1|wf2 — mỗi cái một bot riêng
   */
  constructor(bot, opts = {}) {
    this.bot = bot;
    this.id = String(opts.id || 'wf1').toLowerCase();
    this.label = String(opts.label || this.id.toUpperCase());
    this.cmd = '/' + this.id;
    this.cmdBot = '/' + this.id + 'bot';
    this.sessions = new Map();
  }

  getSettings() {
    if (!this.bot.settings.workflow) {
      this.bot.settings.workflow = {};
    }
    return this.bot.settings.workflow;
  }

  botPeerKey() {
    return this.id + 'BotPeer';
  }

  getBotPeerConfig() {
    const wf = this.getSettings();
    const key = this.botPeerKey();
    let v = String(wf[key] || '').trim();
    if (!v && this.id === 'wf1') {
      v = String(wf.wfBotPeer || '').trim();
      if (v) {
        wf[key] = v;
        require('./utils').saveSettings(this.bot.settings);
      }
    }
    return v;
  }

  setBotPeerConfig(peer) {
    const wf = this.getSettings();
    wf[this.botPeerKey()] = String(peer || '').trim();
    if (this.id === 'wf1') wf.wfBotPeer = wf[this.botPeerKey()];
    require('./utils').saveSettings(this.bot.settings);
  }

  getSession(controlChatId) {
    return this.sessions.get(String(controlChatId));
  }

  clearSession(controlChatId) {
    this.sessions.delete(String(controlChatId));
  }

  isAwaitingUserInput(controlChatId) {
    const s = this.getSession(controlChatId);
    return s && s.phase === 'await_account';
  }

  async resolvePeer(peerStr) {
    const raw = String(peerStr || '').trim();
    if (!raw) throw new Error(`Chưa cấu hình bot — dùng ${this.cmdBot} @bot hoặc chat id`);
    let target = raw;
    if (target.startsWith('@')) target = target.slice(1);
    if (/^-?\d+$/.test(target)) {
      return await this.bot.client.getEntity(Number(target));
    }
    return await this.bot.client.getEntity(target);
  }

  async notify(controlChatId, text, replyTo = null) {
    try {
      await this.bot.client.sendMessage(controlChatId, {
        message: text,
        replyTo: replyTo || undefined,
      });
    } catch (e) {
      const Utils = require('./utils');
      Utils.log(`⚠️ ${this.label} notify: ${e.message}`);
    }
  }

  async getLatestMessage(peer) {
    const msgs = await this.bot.client.getMessages(peer, { limit: 8 });
    return msgs && msgs[0] ? msgs[0] : null;
  }

  async getButtons(msg) {
    if (!msg) return [];
    const rows = await msg.getButtons();
    return flattenButtons(rows);
  }

  async clickButton(msg, target, peer) {
    const flat = await this.getButtons(msg);
    const btn = findButton(flat, target);
    if (!btn) {
      const labels = flat.map((b, i) => `${i + 1}. ${b.text}`).join('\n') || '(không có)';
      throw new Error(`Không tìm thấy button.\nHiện có:\n${labels}`);
    }
    await msg.click({ i: btn.row, j: btn.col });
    await sleep(1800);
    return this.getLatestMessage(peer);
  }

  async clickIndex(msg, index, peer) {
    return this.clickButton(msg, index, peer);
  }

  /**
   * /wf1bot|/wf2bot|/wfbot [@user|id]
   */
  async handleWfBotCommand(args, chatId, messageId) {
    if (!args.length) {
      const cur = this.getBotPeerConfig() || '(chưa đặt)';
      await this.bot.sendReply(
        chatId,
        messageId,
        [
          `🤖 ${this.label} bot hiện tại: \`${cur}\``,
          '',
          `Đặt bot: \`${this.cmdBot} @tenbot\` hoặc \`${this.cmdBot} <chatId>\``,
          this.id === 'wf1' ? '(alias: `/wfbot`)' : '',
        ]
          .filter(Boolean)
          .join('\n')
      );
      return;
    }
    const peer = args.join(' ').trim();
    try {
      const entity = await this.resolvePeer(peer);
      const label =
        entity.username
          ? `@${entity.username}`
          : `${entity.firstName || entity.title || ''}`.trim() || peer;
      const id = entity.id != null ? String(entity.id) : peer;
      const store = entity.username ? `@${entity.username}` : id;
      this.setBotPeerConfig(store);
      await this.bot.sendReply(
        chatId,
        messageId,
        `✅ Đã đặt ${this.label} bot: ${label} (\`${store}\` / id \`${id}\`)`
      );
    } catch (e) {
      await this.bot.sendReply(chatId, messageId, `❌ Không resolve được bot: ${e.message}`);
    }
  }

  /**
   * /wf1|/wf2 on|off|status|help
   */
  async handleWfCommand(args, chatId, messageId) {
    const action = String(args[0] || 'help').toLowerCase();
    if (action === 'off' || action === 'stop' || action === 'cancel') {
      this.clearSession(chatId);
      await this.bot.sendReply(chatId, messageId, `🛑 Đã tắt / hủy ${this.label}.`);
      return;
    }
    if (action === 'status') {
      const s = this.getSession(chatId);
      const bot = this.getBotPeerConfig() || '(chưa đặt)';
      await this.bot.sendReply(
        chatId,
        messageId,
        [
          `${this.label}: ${s ? `🟢 ${s.phase}` : '🔴 idle'}`,
          `Bot: \`${bot}\``,
          s?.stats
            ? `Đã sửa: ${s.stats.fixed} · Bỏ qua: ${s.stats.skipped} · Lỗi: ${s.stats.errors}`
            : '',
        ]
          .filter(Boolean)
          .join('\n')
      );
      return;
    }
    if (action === 'on' || action === 'start' || action === 'run') {
      if (this.getSession(chatId)?.phase === 'processing') {
        await this.bot.sendReply(
          chatId,
          messageId,
          `⏳ ${this.label} đang chạy — ${this.cmd} off để hủy.`
        );
        return;
      }
      if (!this.getBotPeerConfig()) {
        await this.bot.sendReply(
          chatId,
          messageId,
          `❌ Chưa đặt bot. Dùng: \`${this.cmdBot} @bot\` rồi \`${this.cmd} on\`.`
        );
        return;
      }
      await this.bot.sendReply(chatId, messageId, `🚀 Bắt đầu ${this.label}…`);
      this.runUntilAccountPick(chatId, messageId).catch(async (err) => {
        this.clearSession(chatId);
        await this.notify(chatId, `❌ ${this.label} lỗi: ${err.message}`, messageId);
      });
      return;
    }

    await this.bot.sendReply(
      chatId,
      messageId,
      [
        `**${this.label}** — tự động thao tác bot khác (bot riêng từng WF)`,
        '',
        `\`${this.cmdBot} @bot\` — đặt bot cho ${this.label}`,
        `\`${this.cmd} on\` — chạy workflow sửa thời gian GD`,
        `\`${this.cmd} off\` — hủy`,
        `\`${this.cmd} status\``,
        '',
        'WF2 (gửi `/bdsd`) là workflow khác — xem `/wf2` / `/wf2bot`.',
      ].join('\n')
    );
  }

  /** @deprecated alias */
  async handleWf1Command(args, chatId, messageId) {
    return this.handleWfCommand(args, chatId, messageId);
  }

  async runUntilAccountPick(controlChatId, replyTo) {
    const peerCfg = this.getBotPeerConfig();
    const peer = await this.resolvePeer(peerCfg);
    this.sessions.set(String(controlChatId), {
      phase: 'processing',
      peerCfg,
      peer,
      controlChatId: String(controlChatId),
      replyTo,
      stats: { fixed: 0, skipped: 0, errors: 0 },
      accountButtons: [],
    });

    await this.notify(controlChatId, `📤 Gửi /start tới ${peerCfg}…`, replyTo);
    await this.bot.client.sendMessage(peer, { message: '/start' });
    await sleep(2000);
    let msg = await this.getLatestMessage(peer);
    if (!msg) throw new Error('Không nhận được tin từ bot sau /start');

    await this.notify(controlChatId, '👆 Bấm button đầu tiên…', replyTo);
    msg = await this.clickIndex(msg, 0, peer);

    await this.notify(controlChatId, '👆 Bấm button thứ 2…', replyTo);
    msg = await this.clickIndex(msg, 1, peer);

    await this.notify(controlChatId, '👆 Chọn “tài khoản còn hạn”…', replyTo);
    msg = await this.clickButton(msg, BTN.accountValid, peer);

    const flat = await this.getButtons(msg);
    if (!flat.length) throw new Error('Không thấy danh sách button tài khoản');

    const session = this.getSession(controlChatId);
    session.phase = 'await_account';
    session.botMsgId = msg.id;
    session.accountButtons = flat.map((b, i) => ({
      index: i,
      text: b.text,
      row: b.row,
      col: b.col,
    }));
    session.lastMsg = msg;

    const list = session.accountButtons
      .map((b) => `${b.index + 1}. ${b.text}`)
      .join('\n');
    await this.notify(
      controlChatId,
      [
        '📋 Chọn tài khoản (reply số hoặc tên button):',
        list,
        '',
        'Ví dụ: `1` hoặc dán đúng tên button.',
        `Hủy: ${this.cmd} off`,
      ].join('\n'),
      replyTo
    );
  }

  /**
   * User chọn account trong chat điều khiển.
   * @returns {boolean} true nếu đã xử lý
   */
  async handleUserAccountPick(controlChatId, messageText, messageId) {
    const session = this.getSession(controlChatId);
    if (!session || session.phase !== 'await_account') return false;

    const text = String(messageText || '').trim();
    if (!text || text.startsWith('/')) return false;

    let pick = null;
    if (/^\d+$/.test(text)) {
      const n = parseInt(text, 10) - 1;
      pick = session.accountButtons[n];
    } else {
      const q = text.toLowerCase();
      pick =
        session.accountButtons.find((b) => b.text.toLowerCase() === q) ||
        session.accountButtons.find((b) => b.text.toLowerCase().includes(q));
    }
    if (!pick) {
      await this.notify(
        controlChatId,
        '❗ Không khớp button. Gửi số thứ tự hoặc tên button trong danh sách.',
        messageId
      );
      return true;
    }

    session.phase = 'processing';
    session.chosenAccount = pick.text;
    await this.notify(
      controlChatId,
      `✅ Đã chọn: ${pick.text}\nTiếp tục chỉnh giao dịch…`,
      messageId
    );

    this.continueAfterAccount(controlChatId).catch(async (err) => {
      this.clearSession(controlChatId);
      await this.notify(
        controlChatId,
        `❌ ${this.label} lỗi: ${err.message}`,
        messageId
      );
    });
    return true;
  }

  async continueAfterAccount(controlChatId) {
    const session = this.getSession(controlChatId);
    if (!session) return;
    const { peer, replyTo } = session;

    let msg = session.lastMsg || (await this.getLatestMessage(peer));
    // Click account button
    msg = await this.clickButton(msg, session.chosenAccount, peer);

    // Có bot có 2 bước (menu rồi chỉnh); bot test chỉ có "✏️ Chỉnh Giao Dịch"
    const flatAfterAccount = await this.getButtons(msg);
    if (findButton(flatAfterAccount, BTN.editTxMenu)) {
      await this.notify(controlChatId, '👆 Chỉnh sửa giao dịch…', replyTo);
      msg = await this.clickButton(msg, BTN.editTxMenu, peer);
    }

    await this.notify(controlChatId, '👆 Chỉnh giao dịch…', replyTo);
    msg = await this.clickButton(msg, BTN.editTx, peer);

    await this.processTransactionLoop(controlChatId, msg);
  }

  isLikelyTransactionButton(text) {
    const t = String(text || '');
    if (BTN.back.test(t) || BTN.nextPage.test(t) || BTN.prevPage.test(t)) return false;
    if (BTN.editTxMenu.test(t) || BTN.editTx.test(t)) return false;
    if (BTN.editTime.test(t)) return false;
    if (BTN.accountValid.test(t)) return false;
    // Field / menu trên màn chi tiết — KHÔNG phải dòng GD trong list
    // (trước đây nhầm mở "Sửa Số Tiền", "Tên Người Chuyển"…)
    if (/t[aạ]o\s*giao\s*d[iị]ch/i.test(t)) return false;
    if (/lo[aạ]i\s*giao\s*d[iị]ch/i.test(t)) return false;
    if (/s[uử]a\s*s[oố]\s*ti[eề]n|s[oố]\s*ti[eề]n/i.test(t)) return false;
    if (/c[oộ]ng\s*ti[eề]n|tr[uừ]\s*ti[eề]n/i.test(t)) return false;
    if (/ng[uư][oờ]i\s*chuy[eể]n|t[eê]n\s*ng[uư][oờ]i/i.test(t)) return false;
    if (/\bstk\b|s[oố]\s*t[aà]i\s*kho[aả]n|m[aã]\s*giao\s*d[iị]ch/i.test(t)) {
      return false;
    }
    if (/n[oộ]i\s*dung|ghi\s*ch[uú]/i.test(t) && !DT_COMPACT_RE.test(t)) return false;
    if (/th[oờ]i\s*gian/i.test(t) && !DT_COMPACT_RE.test(t) && !DT_SLASH_RE.test(t)) {
      return false;
    }
    if (/^✅|^❌|^✔️|th[aà]nh\s*c[oô]ng|đ[aã]\s*l[uưu]|x[aá]c\s*nh[aậ]n/i.test(t)) {
      return false;
    }
    // List GD thực tế: "+6,500,000đ | TÊN" hoặc có ngày/giờ
    if (/[+-]?\d[\d.,]*\s*đ/i.test(t)) return true;
    if (DT_COMPACT_RE.test(t) || DT_SLASH_RE.test(t)) return true;
    if (/\|\s*\S+/.test(t) && /\d/.test(t)) return true;
    return false;
  }

  /** Tìm message gần nhất còn button Quay lại (khi đang kẹt màn nhập text). */
  async findMessageWithBack(peer, limit = 12) {
    const msgs = await this.bot.client.getMessages(peer, { limit });
    for (const m of msgs || []) {
      const flat = await this.getButtons(m);
      if (findButton(flat, BTN.back)) return m;
    }
    return null;
  }

  isDetailScreen(flat) {
    return !!(
      findButton(flat, /s[uử]a\s*th[oờ]i\s*gian|th[oờ]i\s*gian/i) ||
      findButton(flat, /s[uử]a\s*s[oố]\s*ti[eề]n/i) ||
      findButton(flat, /s[uử]a\s*ng[uư][oờ]i\s*chuy[eể]n/i)
    );
  }

  isTxListScreen(msg, flat) {
    const body = String(msg?.message || msg?.text || '');
    if (/Edit\s*LSGD|Ch[oọ]n\s*giao\s*d[iị]ch\s*đ[eể]\s*s[uử]a|Trang\s*\d+\s*\/\s*\d+/i.test(body)) {
      return true;
    }
    const tx = (flat || []).filter((b) => this.isLikelyTransactionButton(b.text));
    if (tx.length > 0) return true;
    // Có nút Sau/Trước của list, không phải màn chi tiết
    if (
      (findButton(flat, BTN.nextPage) || findButton(flat, BTN.prevPage)) &&
      !this.isDetailScreen(flat)
    ) {
      return true;
    }
    return false;
  }

  /** Đảm bảo đang ở màn list GD (Edit LSGD). Nếu lệch ra menu cha thì bấm lại Chỉnh Giao Dịch. */
  async ensureTxList(msg, peer) {
    const Utils = require('./utils');
    for (let i = 0; i < 5; i++) {
      msg = (await this.getLatestMessage(peer)) || msg;
      let flat = await this.getButtons(msg);
      if (this.isTxListScreen(msg, flat)) {
        // Ưu tiên đúng message list nếu latest là tin khác
        if (!this.isTxListScreen(msg, flat) || !(flat || []).length) {
          const found = await this.findTxListMessage(peer);
          if (found) return found;
        }
        return msg;
      }
      // Còn kẹt màn chi tiết → Quay lại
      if (this.isDetailScreen(flat)) {
        const back = findButton(flat, BTN.back) || findButton(flat, BTN.backLoose);
        if (back) {
          Utils.log(`${this.label} ensureTxList: còn chi tiết → Quay lại`);
          msg = await this.clickButton(msg, back.text, peer);
          await sleep(1000);
          continue;
        }
      }
      // Menu cha có Chỉnh Giao Dịch
      if (findButton(flat, BTN.editTxMenu)) {
        Utils.log(`${this.label} ensureTxList: vào Chỉnh sửa giao dịch`);
        msg = await this.clickButton(msg, BTN.editTxMenu, peer);
        await sleep(1000);
        flat = await this.getButtons(msg);
      }
      if (findButton(flat, BTN.editTx)) {
        Utils.log(`${this.label} ensureTxList: vào Chỉnh Giao Dịch`);
        msg = await this.clickButton(msg, BTN.editTx, peer);
        await sleep(1200);
        continue;
      }
      const found = await this.findTxListMessage(peer);
      if (found) return found;
      await sleep(800);
    }
    return (await this.findTxListMessage(peer)) || (await this.getLatestMessage(peer)) || msg;
  }

  async findTxListMessage(peer, limit = 15) {
    const msgs = await this.bot.client.getMessages(peer, { limit });
    for (const m of msgs || []) {
      const flat = await this.getButtons(m);
      if (this.isTxListScreen(m, flat)) return m;
    }
    return null;
  }

  /**
   * Sau chỉnh thời gian: Quay lại (chờ bảng mới) lặp đến khi về list GD.
   * Không bấm Quay lại khi đã ở Edit LSGD — tránh thoát ra menu cha.
   */
  async returnToTransactionList(msg, peer, { afterEdit = false } = {}) {
    if (afterEdit) {
      const Utils = require('./utils');
      for (let step = 1; step <= 3; step++) {
        msg = (await this.getLatestMessage(peer)) || msg;
        let flat = await this.getButtons(msg);
        if (!flat.length) {
          const withBtns = await this.findMessageWithBack(peer);
          if (withBtns) {
            msg = withBtns;
            flat = await this.getButtons(msg);
          }
        }

        if (this.isTxListScreen(msg, flat)) {
          Utils.log(`${this.label} afterEdit: đã về list GD (sau bước ${step - 1 || 'check'})`);
          return msg;
        }

        if (!this.isDetailScreen(flat) && !findButton(flat, BTN.back)) {
          // Không phải chi tiết — thử tìm list trong lịch sử
          const found = await this.findTxListMessage(peer);
          if (found) return found;
        }

        const backBtn = findButton(flat, BTN.back) || findButton(flat, BTN.backLoose);
        if (!backBtn) {
          Utils.log(
            `⚠️ ${this.label} afterEdit: không thấy Quay lại (bước ${step}). Buttons: ${flat.map((b) => b.text).join(' | ') || '(không có)'}`
          );
          break;
        }

        // Chỉ Quay lại khi còn màn chi tiết (hoặc chưa phải list)
        if (this.isTxListScreen(msg, flat)) break;

        Utils.log(`${this.label} afterEdit Quay lại #${step}: ${backBtn.text}`);
        const beforeId = msg?.id || 0;
        await sleep(300);
        msg = await this.clickButton(msg, backBtn.text, peer);

        // Chờ bảng/tin mới trước lần Quay lại tiếp (nếu cần)
        for (let t = 0; t < 10; t++) {
          await sleep(600);
          const latest = await this.getLatestMessage(peer);
          const flatL = await this.getButtons(latest);
          if (this.isTxListScreen(latest, flatL)) {
            Utils.log(`${this.label} afterEdit: bảng mới là list GD — dừng Quay lại`);
            return latest;
          }
          if (latest && latest.id !== beforeId && flatL.length) {
            msg = latest;
            break;
          }
          if (t >= 2 && flatL.length) {
            msg = latest || msg;
            break;
          }
        }
      }
      return (await this.ensureTxList(msg, peer)) || msg;
    }

    for (let i = 0; i < 2; i++) {
      const flat = await this.getButtons(msg);
      if (this.isTxListScreen(msg, flat)) break;
      const txLike = flat.filter((b) => this.isLikelyTransactionButton(b.text));
      const hasNext = !!findButton(flat, BTN.nextPage);
      if (txLike.length > 0 || hasNext) break;
      if (!findButton(flat, BTN.back)) {
        await sleep(800);
        msg = (await this.getLatestMessage(peer)) || msg;
        continue;
      }
      await sleep(800);
      msg = await this.clickButton(msg, BTN.back, peer);
    }
    await sleep(800);
    return (await this.ensureTxList(msg, peer)) || msg;
  }

  /** Về trang 1 của list GD (bấm Trước đến hết). */
  async goToFirstTxPage(msg, peer) {
    for (let i = 0; i < 15; i++) {
      const flat = await this.getButtons(msg);
      const prev = findButton(flat, BTN.prevPage);
      if (!prev) break;
      msg = await this.clickButton(msg, prev.text, peer);
      await sleep(500);
    }
    return msg;
  }

  /**
   * Quét mọi trang list GD đến khi một vòng full (hết trang) không còn GD lệch thời gian.
   * Sau mỗi lần sửa, list sắp xếp lại theo thời gian → clear và quét lại trang hiện tại;
   * hết trang mà vẫn có sửa trong vòng → về trang 1, quét vòng mới.
   */
  async processTransactionLoop(controlChatId, listMsg) {
    const session = this.getSession(controlChatId);
    if (!session) return;
    const { peer, replyTo } = session;
    let msg = listMsg;
    const maxSweeps = 25;
    const maxPagesPerSweep = 40;

    for (let sweep = 1; sweep <= maxSweeps; sweep++) {
      if (!this.getSession(controlChatId)) {
        await this.notify(controlChatId, `🛑 ${this.label} đã hủy.`, replyTo);
        return;
      }

      let fixedThisSweep = 0;
      await this.notify(
        controlChatId,
        `🔁 Vòng quét ${sweep}: duyệt mọi trang đến khi hết chỗ sai…`,
        replyTo
      );
      msg = await this.ensureTxList(msg, peer);
      msg = await this.goToFirstTxPage(msg, peer);
      msg = await this.ensureTxList(msg, peer);

      for (let page = 1; page <= maxPagesPerSweep; page++) {
        if (!this.getSession(controlChatId)) return;
        msg = await this.ensureTxList(msg, peer);

        // Quét trang hiện tại đến khi không còn GD cần sửa trên trang này
        // (sau mỗi lần sửa list đổi chỗ → quét lại từ đầu trang)
        const seenOk = new Set();
        let pageGuard = 0;
        while (pageGuard < 40) {
          pageGuard += 1;
          if (!this.getSession(controlChatId)) return;

          msg = (await this.getLatestMessage(peer)) || msg;
          // Nếu latest không còn list, tìm lại message Edit LSGD
          let flat = await this.getButtons(msg);
          if (!this.isTxListScreen(msg, flat)) {
            msg = await this.ensureTxList(msg, peer);
            flat = await this.getButtons(msg);
          }
          const txButtons = flat.filter((b) => this.isLikelyTransactionButton(b.text));
          const candidate = txButtons.find((b) => !seenOk.has(b.text));

          if (!candidate) {
            const Utils = require('./utils');
            Utils.log(
              `${this.label} V${sweep} T${page}: hết candidate. buttons=${flat.map((b) => b.text).join(' || ') || '(không)'}`
            );
            break;
          }

          const label = candidate.text;
          await this.notify(
            controlChatId,
            `🔎 [V${sweep}·T${page}] Mở: ${label.slice(0, 100)}`,
            replyTo
          );
          let detail = await this.clickButton(msg, label, peer);
          const body = String(detail?.message || detail?.text || '');
          const contentTime = extractContentTime(body);
          const fieldTime = extractFieldTime(body);
          const rawField = extractFieldTimeRaw(body);

          if (!contentTime) {
            session.stats.errors += 1;
            await this.notify(
              controlChatId,
              `⚠️ Không parse được thời gian Nội dung — bỏ qua.\n${body.slice(0, 350)}`,
              replyTo
            );
            msg = await this.returnToTransactionList(detail, peer, {
              afterEdit: false,
            });
            seenOk.add(label);
            continue;
          }

          if (shouldSkipTimeEdit(contentTime, fieldTime, rawField)) {
            session.stats.skipped += 1;
            await this.notify(
              controlChatId,
              `⏭️ Đã đúng (${contentTime}, không giây) — bỏ qua.`,
              replyTo
            );
            msg = await this.returnToTransactionList(detail, peer, {
              afterEdit: false,
            });
            seenOk.add(label);
            continue;
          }

          const reason = fieldTimeHasSeconds(rawField)
            ? 'còn giây'
            : fieldTime
              ? 'lệch Nội dung'
              : 'trống';
          await this.notify(
            controlChatId,
            `✏️ Sửa (${reason}): \`${rawField || fieldTime || '(trống)'}\` → \`${contentTime}\``,
            replyTo
          );
          try {
            detail = await this.editTimeOnDetail(detail, peer, contentTime);
            session.stats.fixed += 1;
            fixedThisSweep += 1;
            await this.notify(
              controlChatId,
              `✅ Đã chỉnh → ${contentTime} (sửa ${session.stats.fixed} / bỏ qua ${session.stats.skipped})\n↩️ Quay lại → chờ bảng mới → Quay lại…\n(List đổi theo thời gian — quét lại trang/các trang)`,
              replyTo
            );
            msg = await this.returnToTransactionList(detail, peer, {
              afterEdit: true,
            });
            // List đã sắp xếp lại — xóa seenOk, quét lại trang từ đầu
            seenOk.clear();
          } catch (e) {
            session.stats.errors += 1;
            await this.notify(
              controlChatId,
              `⚠️ Không chỉnh được: ${e.message}`,
              replyTo
            );
            msg = await this.returnToTransactionList(detail, peer, {
              afterEdit: false,
            });
            seenOk.add(label);
          }
        }

        // Hết GD cần sửa trên trang → Sang trang sau nếu có
        msg = await this.ensureTxList(msg, peer);
        let flat = await this.getButtons(msg);
        let nextBtn = findButton(flat, BTN.nextPage);
        if (!nextBtn) {
          // Thử tìm đúng message list (Trang 1/2) nếu latest bị lệch
          const listMsg = await this.findTxListMessage(peer);
          if (listMsg) {
            msg = listMsg;
            flat = await this.getButtons(msg);
            nextBtn = findButton(flat, BTN.nextPage);
          }
        }
        if (nextBtn) {
          await this.notify(
            controlChatId,
            `👉 Trang sau: ${nextBtn.text}`,
            replyTo
          );
          msg = await this.clickButton(msg, nextBtn.text, peer);
          await sleep(1000);
          continue;
        }

        const Utils = require('./utils');
        Utils.log(
          `${this.label} V${sweep}: hết trang (không nút Sau). buttons=${flat.map((b) => b.text).join(' || ') || '(không)'} body=${String(msg?.message || '').slice(0, 80)}`
        );
        // Hết trang trong vòng này
        break;
      }

      if (fixedThisSweep === 0) {
        await this.notify(
          controlChatId,
          `✨ Vòng ${sweep}: không còn GD lệch trên mọi trang.`,
          replyTo
        );
        break;
      }

      await this.notify(
        controlChatId,
        `🔄 Vòng ${sweep} đã sửa ${fixedThisSweep} GD (list đổi chỗ) — về trang 1 quét lại toàn bộ…`,
        replyTo
      );
      msg = await this.goToFirstTxPage(msg, peer);
    }

    const s = this.getSession(controlChatId);
    const stats = s?.stats || { fixed: 0, skipped: 0, errors: 0 };
    this.clearSession(controlChatId);
    await this.notify(
      controlChatId,
      [
        `🏁 ${this.label} xong — đã quét hết trang đến khi không còn chỗ sai.`,
        `Đã sửa: ${stats.fixed}`,
        `Bỏ qua (đã trùng): ${stats.skipped}`,
        `Lỗi: ${stats.errors}`,
      ].join('\n'),
      replyTo
    );
  }

  async tryBack(msg, peer) {
    return this.returnToTransactionList(msg, peer, { afterEdit: false });
  }

  async editTimeOnDetail(detailMsg, peer, newTime) {
    let msg = detailMsg;
    const flat = await this.getButtons(msg);
    const labels = flat.map((b) => b.text);
    const Utils = require('./utils');
    Utils.log(`${this.label} detail buttons: ${labels.join(' || ') || '(không có)'}`);

    // Chỉ bấm button đúng "Thời gian" (ưu tiên khớp chính xác / bắt đầu bằng)
    const timeBtn =
      flat.find((b) => /^⏰?\s*th[oờ]i\s*gian\b/i.test(b.text)) ||
      flat.find((b) => /th[oờ]i\s*gian/i.test(b.text) && !/ng[uư][oờ]i|s[oố]\s*ti[eề]n|n[oộ]i\s*dung/i.test(b.text)) ||
      null;
    if (!timeBtn) {
      throw new Error(
        `Không thấy button Thời gian. Buttons: ${labels.join(' | ')}`
      );
    }
    Utils.log(`${this.label} click Thời gian: ${timeBtn.text}`);
    msg = await this.clickButton(msg, timeBtn.text, peer);

    const prompt = String(msg?.message || msg?.text || '');
    if (/t[eê]n\s*ng[uư][oờ]i|ng[uư][oờ]i\s*chuy[eể]n|s[oố]\s*ti[eề]n|n[oộ]i\s*dung/i.test(prompt) && !/th[oờ]i\s*gian/i.test(prompt)) {
      throw new Error(
        `Nhầm field (bot hỏi: ${prompt.slice(0, 80)}) — abort trước khi gửi giá trị.`
      );
    }

    await this.bot.client.sendMessage(peer, { message: newTime });
    await sleep(1500);

    // Lấy tin mới nhất có Quay lại (màn chi tiết), bỏ qua tin "Nhập giá trị…" không keyboard
    for (let i = 0; i < 5; i++) {
      const latest = await this.getLatestMessage(peer);
      const body = String(latest?.message || latest?.text || '');
      const flatLatest = await this.getButtons(latest);
      if (findButton(flatLatest, BTN.back)) return latest;
      if (/nh[aậ]p\s*gi[aá]\s*tr[iị]/i.test(body) && !findButton(flatLatest, BTN.back)) {
        // Vẫn đang ở prompt — tìm msg chi tiết gần nhất có Quay lại
        const withBack = await this.findMessageWithBack(peer);
        if (withBack) return withBack;
      }
      await sleep(700);
    }
    const withBack = await this.findMessageWithBack(peer);
    if (withBack) return withBack;
    return this.getLatestMessage(peer);
  }
}

module.exports = {
  WfRunner,
  Wf1Runner: WfRunner, // alias
  extractContentTime,
  extractFieldTime,
  extractFieldTimeRaw,
  fieldTimeHasSeconds,
  shouldSkipTimeEdit,
  formatEditTime,
  parseAnyDateTimeInChunk,
};
