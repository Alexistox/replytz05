/**
 * Workflow WF1 / WF3 — điều khiển bot Telegram khác qua inline/reply keyboard.
 *
 * WF1: /wf1bot + /wf1 — sửa thời gian KHÔNG giây (15/11/2026 18:34)
 * WF3: /wf3bot + /wf3 — giống WF1 nhưng GIỮ giây (15/11/2026 18:34:26)
 * WF2: gửi /bdsd — xem workflow-wf2.js
 *
 * Luồng:
 * 1) /start → bấm button đầu → button thứ 2
 * 2) User chọn filter: "tài khoản còn hạn" hoặc "tài khoản hết hạn"
 * 3) Liệt kê button tài khoản → user chọn
 * 4) "chỉnh sửa giao dịch" → "chỉnh giao dịch"
 * 5) Lặp từng giao dịch: so sánh thời gian trong Nội dung vs mục thời gian;
 *    trùng → bỏ qua; khác → chỉnh thời gian theo Nội dung; báo cáo về chat.
 */

const { Api } = require('telegram');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BTN = {
  accountValid: /t[aà]i\s*kho[aả]n\s*c[oò]n\s*h[aạ]n/i,
  accountExpired: /t[aà]i\s*kho[aả]n\s*h[eế]t\s*h[aạ]n/i,
  /** Còn hạn hoặc hết hạn — bước filter trước khi liệt kê TK */
  accountFilter:
    /t[aà]i\s*kho[aả]n\s*(c[oò]n\s*h[aạ]n|h[eế]t\s*h[aạ]n)/i,
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
 * - Compact 8: 13112026-22:08:11 → DDMMYYYY + giờ (ưu tiên — tránh khớp nhầm 6 số)
 * - Compact 6: 151126-18:34:26 → DDMMYY + giờ
 * - WF1: 15/11/2026 18:34 (bỏ giây)
 * - WF3: 15/11/2026 18:34:26 (giữ giây)
 */
const DT_SLASH_RE =
  /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?)/;
/** DDMMYYYY-HH:mm[:ss] ví dụ 13112026-22:08:11 */
const DT_COMPACT_Y4_RE =
  /(?<!\d)(\d{2})(\d{2})(\d{4})[-–—](\d{1,2}:\d{2}(?::\d{2})?)/;
/** DDMMYY-HH:mm[:ss] ví dụ 151126-18:34:26 — không khớp giữa chuỗi 8 số */
const DT_COMPACT_RE =
  /(?<!\d)(\d{2})(\d{2})(\d{2})[-–—](\d{1,2}:\d{2}(?::\d{2})?)/;

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Chuẩn hóa để so sánh / gửi chỉnh sửa */
function formatEditTime(day, month, year, hh, mm, ss = 0, keepSeconds = false) {
  const d = Number(day);
  const m = Number(month);
  if (!Number.isFinite(d) || !Number.isFinite(m) || m < 1 || m > 12 || d < 1 || d > 31) {
    return null;
  }
  const y = String(year).length === 2 ? `20${year}` : String(year);
  const base = `${pad2(d)}/${pad2(m)}/${y} ${pad2(hh)}:${pad2(mm)}`;
  if (keepSeconds) return `${base}:${pad2(ss != null ? ss : 0)}`;
  return base;
}

function parseTimePart(timePart) {
  const [hh, mm, ss] = String(timePart).split(':');
  return {
    hh: parseInt(hh, 10),
    mm: parseInt(mm, 10),
    ss: ss != null && ss !== '' ? parseInt(ss, 10) : 0,
    hasSeconds: ss != null && ss !== '',
  };
}

function parseSlashDateTime(datePart, timePart, keepSeconds = false) {
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
  return formatEditTime(day, month, year, t.hh, t.mm, t.ss, keepSeconds);
}

/** 151126-… hoặc 13112026-… → DD/MM/YYYY HH:MM[:SS] */
function parseCompactDateTime(match, keepSeconds = false) {
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const yearPart = match[3];
  const year =
    String(yearPart).length === 4
      ? String(yearPart)
      : String(yearPart).length === 2
        ? `20${yearPart}`
        : yearPart;
  const t = parseTimePart(match[4]);
  return formatEditTime(day, month, year, t.hh, t.mm, t.ss, keepSeconds);
}

function firstValidCompact(raw, keepSeconds = false) {
  const text = String(raw || '');
  // Ưu tiên 8 số (DDMMYYYY) — nếu lấy 6 số trên 13112026 sẽ ra 112026 → 11/20 sai
  for (const m of text.matchAll(new RegExp(DT_COMPACT_Y4_RE.source, 'g'))) {
    const parsed = parseCompactDateTime(m, keepSeconds);
    if (parsed) return parsed;
  }
  for (const m of text.matchAll(new RegExp(DT_COMPACT_RE.source, 'g'))) {
    const parsed = parseCompactDateTime(m, keepSeconds);
    if (parsed) return parsed;
  }
  return null;
}

function parseAnyDateTimeInChunk(chunk, keepSeconds = false) {
  const raw = String(chunk || '');
  const compact = firstValidCompact(raw, keepSeconds);
  if (compact) return compact;
  const slash = raw.match(DT_SLASH_RE);
  if (slash) return parseSlashDateTime(slash[1], slash[2], keepSeconds);
  return null;
}

function extractDateTimeFromText(text, labelRe, keepSeconds = false) {
  const raw = String(text || '');
  if (labelRe) {
    const m = raw.match(labelRe);
    if (m) {
      const chunk = m[1] || m[0];
      const parsed = parseAnyDateTimeInChunk(chunk, keepSeconds);
      if (parsed) return parsed;
    }
  }
  const compact = firstValidCompact(raw, keepSeconds);
  if (compact) return compact;
  const slashAll = [...raw.matchAll(new RegExp(DT_SLASH_RE.source, 'g'))];
  for (const s of slashAll) {
    const parsed = parseSlashDateTime(s[1], s[2], keepSeconds);
    if (parsed) return parsed;
  }
  return null;
}

function extractContentTime(text, keepSeconds = false) {
  return (
    extractDateTimeFromText(text, /n[oộ]i\s*dung\s*:\s*([^\n]+)/i, keepSeconds) ||
    extractDateTimeFromText(text, null, keepSeconds)
  );
}

function extractFieldTime(text, keepSeconds = false) {
  return extractDateTimeFromText(text, /th[oờ]i\s*gian\s*:\s*([^\n]+)/i, keepSeconds);
}

/** Lấy raw text sau "Thời gian:" để biết còn giây hay không */
function extractFieldTimeRaw(text) {
  const m = String(text || '').match(/th[oờ]i\s*gian\s*:\s*([^\n]+)/i);
  return m ? String(m[1]).trim() : '';
}

function fieldTimeHasSeconds(rawField) {
  const raw = String(rawField || '');
  if (/\d{1,2}:\d{2}:\d{2}/.test(raw)) return true;
  return false;
}

/**
 * WF1 (keepSeconds=false): bỏ qua khi khớp và field không còn giây.
 * WF3 (keepSeconds=true): bỏ qua khi khớp cả giây.
 */
function shouldSkipTimeEdit(contentTime, fieldTime, rawField, keepSeconds = false) {
  if (!contentTime || !fieldTime) return false;
  if (!keepSeconds && fieldTimeHasSeconds(rawField)) return false;
  return fieldTime === contentTime;
}

/** Key ổn định của GD (không phụ thuộc thứ tự list sau khi sửa). */
function extractTxKey(body, keepSeconds = false) {
  const raw = String(body || '');
  const id =
    raw.match(/S[uử]a\s*Giao\s*D[iị]ch\s*#\s*(\d+)/i) ||
    raw.match(/Mã\s*GD:\s*([A-Z0-9]+)/i) ||
    raw.match(/\b(FT\d+)\b/i);
  if (id) return `id:${id[1]}`;
  const amt = raw.match(/S[oố]\s*ti[eề]n:\s*([^\n]+)/i);
  const ct = extractContentTime(raw, keepSeconds);
  const key = `a:${(amt && amt[1] || '').trim()}|t:${ct || ''}`;
  // Key rỗng trùng nhau → không dùng để đánh dấu done
  if (key === 'a:|t:') return null;
  return key;
}

/** +/- và số từ label nút list, vd "+13,000,000đ | NAME" */
function labelAmountInfo(label) {
  const m = String(label || '').match(/([+-]?)(\d[\d.,]*)\s*đ/i);
  if (!m) return null;
  return {
    sign: m[1] === '-' ? '-' : '+',
    digits: m[2].replace(/[.,\s]/g, ''),
  };
}

/** Số tiền + dấu từ màn chi tiết (Cộng/Trừ tiền). */
function bodyAmountInfo(body) {
  const raw = String(body || '');
  const amt = raw.match(/S[oố]\s*ti[eề]n:\s*([^\n]+)/i);
  if (!amt) return null;
  const digits = String(amt[1]).replace(/[^\d]/g, '');
  if (!digits) return null;
  let sign = '+';
  const loai = raw.match(/Lo[aạ]i\s*giao\s*d[iị]ch:\s*([^\n]+)/i);
  if (loai) {
    if (/tr[uừ]/i.test(loai[1])) sign = '-';
    else if (/c[oộ]ng/i.test(loai[1])) sign = '+';
  }
  return { sign, digits };
}

/** Label nút list có khớp GD đang mở không (tránh stale / trùng tên). */
function detailMatchesLabel(label, body) {
  if (!/S[uử]a\s*Giao\s*D[iị]ch\s*#/i.test(String(body || ''))) return false;
  const a = labelAmountInfo(label);
  const b = bodyAmountInfo(body);
  if (!a || !b) return true;
  return a.digits === b.digits && a.sign === b.sign;
}

function fieldMatchesTarget(rawField, fieldTime, target, keepSeconds) {
  if (!target) return false;
  if (keepSeconds) return fieldTime === target;
  if (fieldTimeHasSeconds(rawField)) return false;
  return fieldTime === target;
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
   * @param {{ id?: string, label?: string, keepSeconds?: boolean }} [opts]
   *   id = wf1|wf3 — mỗi cái một bot riêng
   *   keepSeconds = true → WF3 giữ giây khi sửa thời gian
   */
  constructor(bot, opts = {}) {
    this.bot = bot;
    this.id = String(opts.id || 'wf1').toLowerCase();
    this.label = String(opts.label || this.id.toUpperCase());
    this.keepSeconds = opts.keepSeconds === true;
    this.cmd = '/' + this.id;
    this.cmdBot = '/' + this.id + 'bot';
    this.sessions = new Map();
  }

  extractContentTime(text) {
    return extractContentTime(text, this.keepSeconds);
  }

  extractFieldTime(text) {
    return extractFieldTime(text, this.keepSeconds);
  }

  shouldSkipTimeEdit(contentTime, fieldTime, rawField) {
    return shouldSkipTimeEdit(contentTime, fieldTime, rawField, this.keepSeconds);
  }

  extractTxKey(body) {
    return extractTxKey(body, this.keepSeconds);
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
    return (
      s &&
      (s.phase === 'await_account_filter' || s.phase === 'await_account')
    );
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
    return this.clickAt(msg, btn.row, btn.col, peer);
  }

  /** Bấm đúng ô (row/col) — dùng khi nhiều GD trùng tên trên list. */
  async clickAt(msg, row, col, peer) {
    await msg.click({ i: row, j: col });
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
        this.keepSeconds
          ? 'Sửa thời gian **có giây** (vd `15/11/2026 18:34:26`).'
          : 'Sửa thời gian **không giây** (vd `15/11/2026 18:34`).',
        'WF2 (gửi `/bdsd`) — `/wf2` / `/wf2bot`. WF3 (có giây) — `/wf3` / `/wf3bot`.',
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
      accountFilterButtons: [],
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

    const flatFilters = await this.getButtons(msg);
    const filterBtns = flatFilters.filter((b) => BTN.accountFilter.test(b.text));
    if (!filterBtns.length) {
      const labels = flatFilters.map((b) => b.text).join(' | ') || '(không có)';
      throw new Error(
        `Không thấy button “tài khoản còn hạn / hết hạn”.\nHiện có: ${labels}`
      );
    }

    const session = this.getSession(controlChatId);
    session.phase = 'await_account_filter';
    session.botMsgId = msg.id;
    session.lastMsg = msg;
    session.accountFilterButtons = filterBtns.map((b, i) => ({
      index: i,
      text: b.text,
      row: b.row,
      col: b.col,
    }));

    const list = session.accountFilterButtons
      .map((b) => `${b.index + 1}. ${b.text}`)
      .join('\n');
    await this.notify(
      controlChatId,
      [
        '📋 Chọn loại tài khoản (còn hạn / hết hạn):',
        list,
        '',
        'Reply số hoặc tên button. Ví dụ: `1` hoặc `còn hạn`.',
        `Hủy: ${this.cmd} off`,
      ].join('\n'),
      replyTo
    );
  }

  pickFromButtonList(buttons, messageText) {
    const text = String(messageText || '').trim();
    if (!text) return null;
    if (/^\d+$/.test(text)) {
      return buttons[parseInt(text, 10) - 1] || null;
    }
    const q = text.toLowerCase();
    return (
      buttons.find((b) => b.text.toLowerCase() === q) ||
      buttons.find((b) => b.text.toLowerCase().includes(q)) ||
      null
    );
  }

  /**
   * User chọn filter (còn/hết hạn) hoặc account trong chat điều khiển.
   * @returns {boolean} true nếu đã xử lý
   */
  async handleUserAccountPick(controlChatId, messageText, messageId) {
    const session = this.getSession(controlChatId);
    if (!session) return false;
    if (
      session.phase !== 'await_account_filter' &&
      session.phase !== 'await_account'
    ) {
      return false;
    }

    const text = String(messageText || '').trim();
    if (!text || text.startsWith('/')) return false;

    if (session.phase === 'await_account_filter') {
      return this.handleAccountFilterPick(controlChatId, text, messageId);
    }
    return this.handleAccountButtonPick(controlChatId, text, messageId);
  }

  async handleAccountFilterPick(controlChatId, text, messageId) {
    const session = this.getSession(controlChatId);
    const pick = this.pickFromButtonList(session.accountFilterButtons || [], text);
    if (!pick) {
      await this.notify(
        controlChatId,
        '❗ Không khớp. Gửi số hoặc tên: còn hạn / hết hạn.',
        messageId
      );
      return true;
    }

    session.phase = 'processing';
    session.chosenAccountFilter = pick.text;
    await this.notify(
      controlChatId,
      `✅ Đã chọn loại: ${pick.text}\nĐang lấy danh sách tài khoản…`,
      messageId
    );

    try {
      const { peer, replyTo } = session;
      let msg = session.lastMsg || (await this.getLatestMessage(peer));
      msg = await this.clickButton(msg, pick.text, peer);

      const flat = await this.getButtons(msg);
      if (!flat.length) throw new Error('Không thấy danh sách button tài khoản');

      session.phase = 'await_account';
      session.botMsgId = msg.id;
      session.lastMsg = msg;
      session.accountButtons = flat.map((b, i) => ({
        index: i,
        text: b.text,
        row: b.row,
        col: b.col,
      }));

      const list = session.accountButtons
        .map((b) => `${b.index + 1}. ${b.text}`)
        .join('\n');
      await this.notify(
        controlChatId,
        [
          `📋 Chọn tài khoản (${pick.text}) — reply số hoặc tên button:`,
          list,
          '',
          'Ví dụ: `1` hoặc dán đúng tên button.',
          `Hủy: ${this.cmd} off`,
        ].join('\n'),
        replyTo || messageId
      );
    } catch (err) {
      this.clearSession(controlChatId);
      await this.notify(
        controlChatId,
        `❌ ${this.label} lỗi: ${err.message}`,
        messageId
      );
    }
    return true;
  }

  async handleAccountButtonPick(controlChatId, text, messageId) {
    const session = this.getSession(controlChatId);
    const pick = this.pickFromButtonList(session.accountButtons || [], text);
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
    if (BTN.accountValid.test(t) || BTN.accountExpired.test(t)) return false;
    if (BTN.accountFilter.test(t)) return false;
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

  /** Parse "Edit LSGD - Trang 1/2" → { page, total } hoặc null. */
  parseLsgdPage(msg) {
    const body = String(msg?.message || msg?.text || '');
    const m = body.match(/Trang\s*(\d+)\s*\/\s*(\d+)/i);
    if (!m) return null;
    return { page: parseInt(m[1], 10), total: parseInt(m[2], 10) };
  }

  /**
   * Sau Quay lại bot luôn về trang 1 — nhảy lại trang target bằng Sau/Trước.
   * @returns {{ msg: object, page: number, total: number|null }}
   */
  async goToTxPage(msg, peer, targetPage) {
    const Utils = require('./utils');
    const target = Math.max(1, Number(targetPage) || 1);
    msg = await this.ensureTxList(msg, peer);

    for (let guard = 0; guard < 25; guard++) {
      const info = this.parseLsgdPage(msg);
      const cur = info?.page || 1;
      const total = info?.total || null;
      if (cur === target) {
        return { msg, page: cur, total };
      }
      if (total != null && target > total) {
        return { msg, page: cur, total };
      }

      const flat = await this.getButtons(msg);
      if (cur < target) {
        const next = findButton(flat, BTN.nextPage);
        if (!next) {
          Utils.log(`${this.label} goToTxPage: hết nút Sau tại trang ${cur} (cần ${target})`);
          return { msg, page: cur, total };
        }
        msg = await this.clickButton(msg, next.text, peer);
        await sleep(700);
        msg = (await this.findTxListMessage(peer)) || (await this.getLatestMessage(peer)) || msg;
        const after = this.parseLsgdPage(msg);
        if (after && after.page <= cur) {
          Utils.log(
            `${this.label} goToTxPage: Sau không tăng trang (${cur}→${after.page}) — dừng`
          );
          return { msg, page: after.page, total: after.total };
        }
        continue;
      }

      const prev = findButton(flat, BTN.prevPage);
      if (!prev) {
        return { msg, page: cur, total };
      }
      msg = await this.clickButton(msg, prev.text, peer);
      await sleep(700);
      msg = (await this.findTxListMessage(peer)) || (await this.getLatestMessage(peer)) || msg;
    }

    const info = this.parseLsgdPage(msg);
    return { msg, page: info?.page || 1, total: info?.total || null };
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
   * Quét mọi trang đến khi một vòng không sửa gì thêm → DỪNG.
   * - Bấm theo vị trí (row/col), không theo text — tránh trùng "+13,000,000đ | …"
   * - Đối chiếu số tiền label ↔ chi tiết trước khi bỏ qua/sửa
   * - Sau sửa phải xác nhận Thời gian đã đúng mới đánh dấu done
   */
  async processTransactionLoop(controlChatId, listMsg) {
    const session = this.getSession(controlChatId);
    if (!session) return;
    const { peer, replyTo } = session;
    let msg = listMsg;
    const maxSweeps = 8;
    const maxPagesPerSweep = 40;
    /** @type {Set<string>} GD đã xử lý xong (đúng hoặc đã sửa 1 lần) — không đụng lại */
    const doneKeys = new Set();

    for (let sweep = 1; sweep <= maxSweeps; sweep++) {
      if (!this.getSession(controlChatId)) {
        await this.notify(controlChatId, `🛑 ${this.label} đã hủy.`, replyTo);
        return;
      }

      let fixedThisSweep = 0;
      let openedThisSweep = 0;
      await this.notify(
        controlChatId,
        `🔁 Vòng ${sweep}: chỉ mở GD chưa xử lý — hết lệch thì dừng.`,
        replyTo
      );
      msg = await this.ensureTxList(msg, peer);
      msg = await this.goToFirstTxPage(msg, peer);
      msg = await this.ensureTxList(msg, peer);

      let page = 1;
      let knownTotal = this.parseLsgdPage(msg)?.total || null;

      for (let pageGuardOuter = 0; pageGuardOuter < maxPagesPerSweep; pageGuardOuter++) {
        if (!this.getSession(controlChatId)) return;

        // Luôn đứng đúng trang target (Quay lại từ chi tiết → về trang 1)
        {
          const nav = await this.goToTxPage(msg, peer, page);
          msg = nav.msg;
          page = nav.page || page;
          if (nav.total) knownTotal = nav.total;
        }

        await this.notify(
          controlChatId,
          `📄 Trang ${page}${knownTotal ? `/${knownTotal}` : ''}`,
          replyTo
        );

        /** Vị trí nút đã thử trên trang hiện tại (list đổi sau edit → clear). */
        const seenPos = new Set();
        let pageGuard = 0;

        while (pageGuard < 40) {
          pageGuard += 1;
          if (!this.getSession(controlChatId)) return;

          // Phục hồi trang nếu Quay lại đẩy về 1
          {
            const curInfo = this.parseLsgdPage(msg);
            if (curInfo && curInfo.page !== page) {
              const nav = await this.goToTxPage(msg, peer, page);
              msg = nav.msg;
              if (nav.total) knownTotal = nav.total;
            }
          }

          msg = (await this.getLatestMessage(peer)) || msg;
          let flat = await this.getButtons(msg);
          if (!this.isTxListScreen(msg, flat)) {
            msg = await this.ensureTxList(msg, peer);
            flat = await this.getButtons(msg);
            const nav = await this.goToTxPage(msg, peer, page);
            msg = nav.msg;
            flat = await this.getButtons(msg);
            if (nav.total) knownTotal = nav.total;
          }

          const txButtons = flat.filter((b) =>
            this.isLikelyTransactionButton(b.text)
          );
          const candidate = txButtons.find(
            (b) => !seenPos.has(`${b.row},${b.col}`)
          );

          if (!candidate) {
            break;
          }

          const posKey = `${candidate.row},${candidate.col}`;
          seenPos.add(posKey);
          const label = candidate.text;
          openedThisSweep += 1;
          await this.notify(
            controlChatId,
            `🔎 [V${sweep}·T${page}] Mở: ${label.slice(0, 100)}`,
            replyTo
          );
          let detail = await this.clickAt(
            msg,
            candidate.row,
            candidate.col,
            peer
          );
          let body = String(detail?.message || detail?.text || '');

          const backToPage = async (detailMsg, afterEdit) => {
            let listMsg = await this.returnToTransactionList(detailMsg, peer, {
              afterEdit,
            });
            const nav = await this.goToTxPage(listMsg, peer, page);
            if (nav.total) knownTotal = nav.total;
            return nav.msg;
          };

          // Stale / nhầm GD (trùng tên trên list) — không đánh dấu done
          if (!detailMatchesLabel(label, body)) {
            await this.notify(
              controlChatId,
              `⚠️ Mở lệch GD (nút \`${label.slice(0, 40)}\` ≠ chi tiết) — thử lại.`,
              replyTo
            );
            msg = await backToPage(detail, false);
            continue;
          }

          const txKey = this.extractTxKey(body);
          const contentTime = this.extractContentTime(body);
          const fieldTime = this.extractFieldTime(body);
          const rawField = extractFieldTimeRaw(body);

          if (txKey && doneKeys.has(txKey)) {
            await this.notify(
              controlChatId,
              `⏭️ Đã xử lý (${txKey}) — bỏ qua.`,
              replyTo
            );
            msg = await backToPage(detail, false);
            continue;
          }

          if (!contentTime) {
            session.stats.errors += 1;
            if (txKey) doneKeys.add(txKey);
            await this.notify(
              controlChatId,
              `⚠️ Không parse được thời gian Nội dung — bỏ qua.\n${body.slice(0, 350)}`,
              replyTo
            );
            msg = await backToPage(detail, false);
            continue;
          }

          if (this.shouldSkipTimeEdit(contentTime, fieldTime, rawField)) {
            session.stats.skipped += 1;
            if (txKey) doneKeys.add(txKey);
            await this.notify(
              controlChatId,
              `⏭️ Đã đúng (${contentTime}) — bỏ qua.`,
              replyTo
            );
            msg = await backToPage(detail, false);
            continue;
          }

          const reason =
            !this.keepSeconds && fieldTimeHasSeconds(rawField)
              ? 'còn giây'
              : fieldTime
                ? 'lệch Nội dung'
                : 'trống';
          await this.notify(
            controlChatId,
            `✏️ Sửa (${reason}): \`${rawField || fieldTime || '(trống)'}\` → \`${contentTime}\`${this.keepSeconds ? ' (có giây)' : ''}`,
            replyTo
          );
          try {
            detail = await this.editTimeOnDetail(detail, peer, contentTime);
            body = String(detail?.message || detail?.text || '');
            if (!detailMatchesLabel(label, body)) {
              const withBack = await this.findMessageWithBack(peer);
              if (withBack) {
                detail = withBack;
                body = String(detail?.message || detail?.text || '');
              }
            }
            const rawAfter = extractFieldTimeRaw(body);
            const fieldAfter = this.extractFieldTime(body);
            if (
              !fieldMatchesTarget(
                rawAfter,
                fieldAfter,
                contentTime,
                this.keepSeconds
              )
            ) {
              throw new Error(
                `Sau sửa vẫn lệch: \`${rawAfter || fieldAfter || '(trống)'}\` (cần \`${contentTime}\`)`
              );
            }
            session.stats.fixed += 1;
            fixedThisSweep += 1;
            if (txKey) doneKeys.add(txKey);
            seenPos.clear();
            await this.notify(
              controlChatId,
              `✅ Đã chỉnh → ${contentTime} (sửa ${session.stats.fixed})\n↩️ Quay lại → về trang ${page}…`,
              replyTo
            );
            msg = await backToPage(detail, true);
          } catch (e) {
            session.stats.errors += 1;
            await this.notify(
              controlChatId,
              `⚠️ Không chỉnh được: ${e.message}`,
              replyTo
            );
            msg = await backToPage(detail, false);
          }
        }

        // Hết nút trên trang → sang trang kế (nếu còn)
        msg = await this.ensureTxList(msg, peer);
        {
          const nav = await this.goToTxPage(msg, peer, page);
          msg = nav.msg;
          if (nav.total) knownTotal = nav.total;
        }

        if (knownTotal != null && page >= knownTotal) {
          break;
        }

        const flat = await this.getButtons(msg);
        const nextBtn = findButton(flat, BTN.nextPage);
        if (!nextBtn) {
          break;
        }

        const beforePage = this.parseLsgdPage(msg)?.page || page;
        await this.notify(
          controlChatId,
          `👉 Trang sau (${beforePage} → ${beforePage + 1})`,
          replyTo
        );
        msg = await this.clickButton(msg, nextBtn.text, peer);
        await sleep(800);
        msg =
          (await this.findTxListMessage(peer)) ||
          (await this.getLatestMessage(peer)) ||
          msg;
        const afterInfo = this.parseLsgdPage(msg);
        if (afterInfo?.total) knownTotal = afterInfo.total;
        if (!afterInfo || afterInfo.page <= beforePage) {
          await this.notify(
            controlChatId,
            `✨ Không sang được trang mới — dừng phân trang.`,
            replyTo
          );
          break;
        }
        page = afterInfo.page;
      }

      // DỪNG khi vòng này không sửa gì (mọi GD mở ra đều đã đúng / đã xử lý)
      if (fixedThisSweep === 0) {
        await this.notify(
          controlChatId,
          openedThisSweep === 0
            ? `✨ Không còn GD chưa xử lý — dừng.`
            : `✨ Vòng ${sweep}: không còn GD lệch — dừng.`,
          replyTo
        );
        break;
      }

      if (sweep >= maxSweeps) break;

      await this.notify(
        controlChatId,
        `🔄 Vòng ${sweep} sửa ${fixedThisSweep} GD — về trang 1 quét GD còn lại (đã sửa thì bỏ qua)…`,
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
        `🏁 ${this.label} đã dừng.`,
        `Đã sửa: ${stats.fixed}`,
        `Bỏ qua (đã đúng): ${stats.skipped}`,
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
