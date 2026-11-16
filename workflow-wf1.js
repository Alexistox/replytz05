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

const BDSD_LINE = /^\s*\/bdsd\s+\S+/i;
const KIND_LINE_RE = /^\s*\d+\.\s*(C[oộ]ng|Tr[uừ]|Cong|Tru)\s*$/im;

function normalizeKind(raw) {
  const s = String(raw || '')
    .normalize('NFC')
    .toLowerCase();
  if (/tr[uừ]|tru/.test(s)) return 'tru';
  return 'cong';
}

/** Parse list nhãn Cộng/Trừ + /bdsd (logic pha B). */
function extractAnnotatedItems(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const items = [];
  let pendingKind = null;
  for (const line of lines) {
    if (
      /^\/(wf[1-4](bot)?|wfbot|phab)(\s|$|@)/i.test(line) &&
      !BDSD_LINE.test(line)
    ) {
      continue;
    }
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
        err.code = 'WF_LIST_FORMAT';
        throw err;
      }
      items.push({ kind: pendingKind, line: line.replace(/^\s+/, '') });
      pendingKind = null;
    }
  }
  return items;
}

function looksLikeAnnotatedList(text) {
  const raw = String(text || '');
  const hasKind = /^\s*\d+\.\s*(C[oộ]ng|Tr[uừ]|Cong|Tru)\s*$/im.test(raw);
  const hasBdsd = /^\s*\/bdsd\s+\S+/im.test(raw);
  if (!hasKind || !hasBdsd) return false;
  try {
    return extractAnnotatedItems(raw).length > 0;
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
  const phone = nums.find((n) => n.length >= 9 && n.length <= 11) || '';
  return { phone, pass: '', name: '', stk, amountDigits, content };
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

function listHasPhone(textOrItems) {
  let items = textOrItems;
  if (!Array.isArray(items)) {
    if (!looksLikeAnnotatedList(textOrItems)) return false;
    try {
      items = extractAnnotatedItems(textOrItems);
    } catch (_e) {
      return false;
    }
  }
  return items.some((it) => {
    const f = parseBdsdFields(it.line);
    return String(f.phone || '').replace(/\D/g, '').length >= 9;
  });
}

/**
 * `/wf1` + list Cộng/Trừ + /bdsd có SĐT → WF1 dùng logic pha B (không phải WF4 hearing).
 */
function isWf1AnnotatedRepairMessage(text) {
  const raw = String(text || '');
  if (!/^\s*\/wf1(?!bot)\b/im.test(raw)) return false;
  return looksLikeAnnotatedList(raw) && listHasPhone(raw);
}

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

  buttonFingerprint(flat) {
    return (flat || []).map((b) => String(b.text || '')).join('||');
  }

  /**
   * Chờ tin có keyboard. Quan trọng: không lấy keyboard CŨ.
   * - afterId: chỉ nhận tin id > afterId, hoặc cùng id nhưng đổi nút (bot edit)
   * - notFingerprint: từ chối nếu bộ nút giống màn trước
   */
  async waitForMessageWithButtons(
    peer,
    {
      minButtons = 1,
      timeoutMs = 15000,
      afterId = 0,
      notFingerprint = null,
      allowSameIdChanged = true,
      requireButtons = true,
    } = {}
  ) {
    const Utils = require('./utils');
    const deadline = Date.now() + timeoutMs;
    let lastCand = null;
    while (Date.now() < deadline) {
      const msgs = await this.bot.client.getMessages(peer, { limit: 12 });
      for (const m of msgs || []) {
        if (!m) continue;
        const flat = await this.getButtons(m);
        const fp = this.buttonFingerprint(flat);
        const enough = flat.length >= minButtons;
        const changed = notFingerprint != null && fp && fp !== notFingerprint;
        const newer = !afterId || m.id > afterId;
        const sameIdNewKeys =
          allowSameIdChanged &&
          afterId &&
          m.id === afterId &&
          changed &&
          enough;

        if (requireButtons && !enough) continue;
        if (notFingerprint != null && fp === notFingerprint) continue;

        if (newer && enough) {
          Utils.log(
            `${this.label} keyboard sẵn sàng #${m.id} (${flat.length} nút): ${flat
              .map((b) => b.text)
              .slice(0, 4)
              .join(' | ')}`
          );
          return m;
        }
        if (sameIdNewKeys) {
          Utils.log(
            `${this.label} keyboard đổi trên #${m.id}: ${flat
              .map((b) => b.text)
              .slice(0, 4)
              .join(' | ')}`
          );
          return m;
        }
        if (enough) lastCand = m;
      }
      // Không có nút (prompt nhập text) nhưng tin mới hơn — chấp nhận nếu không requireButtons
      if (!requireButtons && afterId) {
        for (const m of msgs || []) {
          if (m && m.id > afterId) return m;
        }
      }
      await sleep(700);
    }
    return lastCand || (await this.getLatestMessage(peer));
  }

  /** Đảm bảo msg có đủ nút; nếu thiếu thì chờ tin/keyboard phù hợp (không dính màn cũ). */
  async ensureButtons(
    msg,
    peer,
    { minButtons = 1, timeoutMs = 12000, afterId = 0, notFingerprint = null } = {}
  ) {
    const flat = await this.getButtons(msg);
    const fp = this.buttonFingerprint(flat);
    const okFp = notFingerprint == null || fp !== notFingerprint;
    if (flat.length >= minButtons && okFp && (!afterId || msg?.id > afterId || msg?.id === afterId)) {
      // Nếu yêu cầu màn mới (afterId) mà msg vẫn là tin cũ cùng fingerprint → phải chờ
      if (afterId && msg?.id <= afterId && (!notFingerprint || fp === notFingerprint)) {
        /* fall through */
      } else if (flat.length >= minButtons && okFp) {
        return msg;
      }
    }
    if (!peer) return msg;
    const Utils = require('./utils');
    Utils.log(
      `${this.label} chờ keyboard (≥${minButtons}${afterId ? `, sau #${afterId}` : ''}) — hiện ${flat.length || 0} nút`
    );
    return (
      (await this.waitForMessageWithButtons(peer, {
        minButtons,
        timeoutMs,
        afterId,
        notFingerprint,
      })) || msg
    );
  }

  async clickButton(msg, target, peer) {
    // Chờ keyboard trên ĐÚNG màn hiện tại — không nhảy về tin cũ chỉ vì đủ số nút
    if (typeof target === 'number') {
      msg = await this.ensureButtons(msg, peer, {
        minButtons: target + 1,
        afterId: 0,
        notFingerprint: null,
      });
    } else {
      msg = await this.ensureButtons(msg, peer, { minButtons: 1 });
      let flatTry = await this.getButtons(msg);
      if (!findButton(flatTry, target) && peer) {
        // Nút chưa có trên msg — chờ tin có đúng nút (không dùng fingerprint cũ)
        const deadline = Date.now() + 12000;
        while (Date.now() < deadline) {
          const cand = await this.waitForMessageWithButtons(peer, {
            minButtons: 1,
            timeoutMs: 2000,
          });
          if (cand && findButton(await this.getButtons(cand), target)) {
            msg = cand;
            break;
          }
          await sleep(500);
        }
      }
    }
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
    if (peer) {
      const flat = await this.getButtons(msg);
      if (!flat.length) {
        msg = await this.ensureButtons(msg, peer, { minButtons: 1 });
      }
    }
    const beforeId = msg?.id || 0;
    const beforeFp = this.buttonFingerprint(await this.getButtons(msg));
    await msg.click({ i: row, j: col });
    await sleep(900);
    if (!peer) return null;
    // Bắt buộc chờ màn/keyboard MỚI (id mới hoặc nút đổi) — tránh bấm nút 2 trên màn 1
    const next = await this.waitForMessageWithButtons(peer, {
      minButtons: 1,
      timeoutMs: 15000,
      afterId: beforeId,
      notFingerprint: beforeFp,
      allowSameIdChanged: true,
    });
    if (next) return next;
    // Prompt nhập text không có nút
    return (
      (await this.waitForMessageWithButtons(peer, {
        minButtons: 0,
        timeoutMs: 4000,
        afterId: beforeId,
        requireButtons: false,
      })) || (await this.getLatestMessage(peer))
    );
  }

  async clickIndex(msg, index, peer) {
    return this.clickButton(msg, index, peer);
  }

  /**
   * /start → chờ KB → bấm nút 1 → chờ KB mới → bấm nút 2 → chờ KB mới.
   * Dùng chung WF1/WF3/WF4 để không bấm sớm khi bot chậm.
   */
  async startAndClickFirstTwo(peer, controlChatId, replyTo) {
    await this.bot.client.sendMessage(peer, { message: '/start' });
    await sleep(1000);
    let msg = await this.waitForMessageWithButtons(peer, {
      minButtons: 1,
      timeoutMs: 15000,
    });
    if (!msg || !(await this.getButtons(msg)).length) {
      await this.bot.client.sendMessage(peer, { message: '/start' });
      await sleep(1500);
      msg = await this.waitForMessageWithButtons(peer, {
        minButtons: 1,
        timeoutMs: 12000,
      });
    }
    if (!msg || !(await this.getButtons(msg)).length) {
      throw new Error('Không nhận được keyboard từ bot sau /start');
    }

    const fp0 = this.buttonFingerprint(await this.getButtons(msg));
    if (controlChatId) {
      await this.notify(controlChatId, '👆 Bấm button đầu tiên…', replyTo);
    }
    msg = await this.clickIndex(msg, 0, peer);

    // Chờ rõ màn 2 (khác fingerprint màn 1) trước khi bấm nút thứ 2
    msg = await this.ensureButtons(msg, peer, {
      minButtons: 1,
      timeoutMs: 15000,
      afterId: 0,
      notFingerprint: fp0,
    });
    let flat2 = await this.getButtons(msg);
    if (!flat2.length || this.buttonFingerprint(flat2) === fp0) {
      msg = await this.waitForMessageWithButtons(peer, {
        minButtons: 1,
        timeoutMs: 12000,
        notFingerprint: fp0,
      });
      flat2 = await this.getButtons(msg);
    }
    if (!flat2.length) {
      throw new Error('Sau nút 1 không thấy keyboard màn 2');
    }
    if (controlChatId) {
      await this.notify(controlChatId, '👆 Bấm button thứ 2…', replyTo);
    }
    const fp1 = this.buttonFingerprint(flat2);
    msg = await this.clickIndex(msg, Math.min(1, flat2.length - 1), peer);

    // Chờ màn filter (còn hạn/hết hạn…)
    msg = await this.ensureButtons(msg, peer, {
      minButtons: 1,
      timeoutMs: 15000,
      notFingerprint: fp1,
    });
    return msg;
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
   * /wf1|/wf3 on|off|status|help
   * (/wf1 + list Cộng/Trừ → index route sang WF4 pha B, không xử lý ở đây)
   */
  async handleWfCommand(args, chatId, messageId, rawText = '') {
    void rawText;
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
        this.id === 'wf1'
          ? `\`/wf1\` + list \`N. Cộng|Trừ\` + \`/bdsd …\` (có SĐT) — vào **pha B WF4** (logic WF1+/bdsd trên bot B)`
          : '',
        `\`${this.cmd} off\` — hủy`,
        `\`${this.cmd} status\``,
        '',
        this.keepSeconds
          ? 'Sửa thời gian **có giây** (vd `15/11/2026 18:34:26`).'
          : 'Sửa thời gian **không giây** (vd `15/11/2026 18:34`).',
        'WF2 (gửi `/bdsd`) — `/wf2` / `/wf2bot`. WF3 (có giây) — `/wf3` / `/wf3bot`.',
      ]
        .filter(Boolean)
        .join('\n')
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
    let msg = await this.startAndClickFirstTwo(peer, controlChatId, replyTo);

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
            const beforeEditId = detail?.id || 0;
            const oldTime =
              this.extractFieldTime(String(detail?.message || detail?.text || '')) ||
              extractFieldTimeRaw(String(detail?.message || detail?.text || '')) ||
              null;
            detail = await this.editTimeOnDetail(detail, peer, contentTime);
            body = String(detail?.message || detail?.text || '');
            let rawAfter = extractFieldTimeRaw(body);
            let fieldAfter = this.extractFieldTime(body);
            if (
              !fieldMatchesTarget(
                rawAfter,
                fieldAfter,
                contentTime,
                this.keepSeconds
              )
            ) {
              detail =
                (await this.waitForUpdatedDetailTime(peer, contentTime, {
                  beforeId: beforeEditId,
                  oldTime,
                })) || detail;
              body = String(detail?.message || detail?.text || '');
              rawAfter = extractFieldTimeRaw(body);
              fieldAfter = this.extractFieldTime(body);
            }
            if (!detailMatchesLabel(label, body)) {
              const withBack = await this.findMessageWithBack(peer);
              if (withBack) {
                detail = withBack;
                body = String(detail?.message || detail?.text || '');
                rawAfter = extractFieldTimeRaw(body);
                fieldAfter = this.extractFieldTime(body);
              }
            }
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

  /**
   * Chờ tin chi tiết mới sau khi Quay lại commit giờ (BankAo cập nhật Thời gian).
   */
  async waitForUpdatedDetailTime(peer, targetTime, { beforeId = 0, oldTime = null } = {}) {
    const Utils = require('./utils');
    let lastSeen = null;
    for (let i = 0; i < 10; i++) {
      const msgs = await this.bot.client.getMessages(peer, { limit: 12 });
      for (const m of msgs || []) {
        if (!m || (beforeId && m.id <= beforeId)) continue;
        const body = String(m.message || m.text || '');
        if (!/S[uử]a\s*Giao\s*D[iị]ch\s*#/i.test(body)) continue;
        const flat = await this.getButtons(m);
        if (!findButton(flat, BTN.back)) continue;
        const raw = extractFieldTimeRaw(body);
        if (!raw) continue;
        const field = extractFieldTime(`Thời gian: ${raw}`, this.keepSeconds);
        lastSeen = m;
        if (fieldMatchesTarget(raw, field, targetTime, this.keepSeconds)) {
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

  /**
   * Nhập giờ → chờ thông báo có Quay lại → bấm Quay lại tin mới nhất để commit → lấy chi tiết đã cập nhật.
   */
  async editTimeOnDetail(detailMsg, peer, newTime) {
    let msg = detailMsg;
    const beforeId = detailMsg?.id || 0;
    const oldBody = String(detailMsg?.message || detailMsg?.text || '');
    const oldTime =
      extractFieldTime(oldBody, this.keepSeconds) ||
      extractFieldTimeRaw(oldBody) ||
      null;
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
    await sleep(1000);

    // Thông báo sau nhập giờ → Quay lại tin mới nhất để commit (giống WF4)
    let newestWithBack = null;
    for (let i = 0; i < 10; i++) {
      const msgs = await this.bot.client.getMessages(peer, { limit: 8 });
      for (const m of msgs || []) {
        if (!m || (beforeId && m.id <= beforeId)) continue;
        const flatM = await this.getButtons(m);
        const back = findButton(flatM, BTN.back) || findButton(flatM, BTN.backLoose);
        if (!back) continue;
        newestWithBack = m;
        break;
      }
      if (newestWithBack) break;
      await sleep(600);
    }

    if (newestWithBack) {
      const flatN = await this.getButtons(newestWithBack);
      const backBtn = findButton(flatN, BTN.back) || findButton(flatN, BTN.backLoose);
      Utils.log(
        `${this.label} sau nhập giờ → Quay lại tin mới #${newestWithBack.id}: ${backBtn.text}`
      );
      await this.clickButton(newestWithBack, backBtn.text, peer);
      await sleep(1200);
    }

    const updated = await this.waitForUpdatedDetailTime(peer, newTime, {
      beforeId,
      oldTime,
    });
    if (updated) return updated;

    for (let i = 0; i < 5; i++) {
      const latest = await this.getLatestMessage(peer);
      const body = String(latest?.message || latest?.text || '');
      const flatLatest = await this.getButtons(latest);
      if (/S[uử]a\s*Giao\s*D[iị]ch\s*#/i.test(body) && findButton(flatLatest, BTN.back)) {
        const raw = extractFieldTimeRaw(body);
        const field = extractFieldTime(body, this.keepSeconds);
        if (fieldMatchesTarget(raw, field, newTime, this.keepSeconds)) return latest;
        if (field && oldTime && field !== oldTime) return latest;
      }
      await sleep(700);
    }
    return (await this.findMessageWithBack(peer)) || (await this.getLatestMessage(peer));
  }

  // —— Logic pha B (list Cộng/Trừ + /bdsd): WF1 học để sửa theo list ——

  findPagerPrevSafe(flat) {
    const list = flat || [];
    return (
      list.find((b) =>
        /tr[uư][oớ]c|prev|before|trang\s*tr[uư][oớ]c|v[eề]\s*tr[uư][oớ]c/i.test(b.text)
      ) ||
      list.find((b) => /^\s*«\s*$/.test(b.text) || /^\s*‹\s*$/.test(b.text)) ||
      null
    );
  }

  findPagerNextSafe(flat) {
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

  phonesFromItems(items) {
    const phones = [];
    const seen = new Set();
    for (const it of items || []) {
      const p = String(parseBdsdFields(it.line).phone || '').replace(/\D/g, '');
      if (p.length >= 9 && !seen.has(p)) {
        seen.add(p);
        phones.push(p);
      }
    }
    return phones;
  }

  accountMatchesPhones(btnText, phones) {
    const t = String(btnText || '');
    if (!phones?.length) return false;
    if (BTN.back.test(t) || /quay\s*l[aạ]i/i.test(t)) return false;
    return phones.some((p) => p && t.includes(p));
  }

  isFlipConfirmScreen(msg) {
    const body = String(msg?.message || msg?.text || '');
    return (
      /đ[ãa]\s*đ[oổ]i\s*lo[aạ]i\s*giao\s*d[iị]ch\s*th[aà]nh\s*tr[uừ]/i.test(body) ||
      (/đ[oổ]i\s*lo[aạ]i/i.test(body) &&
        /tr[uừ]\s*ti[eề]n/i.test(body) &&
        /s[oố]\s*d[uư]/i.test(body))
    );
  }

  async findFlipConfirmMessage(peer, limit = 10) {
    const msgs = await this.bot.client.getMessages(peer, { limit });
    for (const m of msgs || []) {
      if (this.isFlipConfirmScreen(m)) return m;
    }
    return null;
  }

  async findDetailMessage(peer, limit = 12) {
    const msgs = await this.bot.client.getMessages(peer, { limit });
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

  detailMatchesItem(body, fields) {
    if (!/S[uử]a\s*Giao\s*D[iị]ch\s*#/i.test(body)) return false;
    const info = bodyAmountInfo(body);
    if (!info || !fields.amountDigits) return false;
    if (info.digits !== fields.amountDigits) return false;
    const raw = String(body || '');
    const needle = contentNeedle(fields.content);
    if (needle && raw.toLowerCase().includes(String(needle).toLowerCase())) {
      return true;
    }
    if (fields.content) {
      const chunk = fields.content.replace(/^GD\s*:\s*/i, '').slice(0, 28);
      if (chunk && raw.toLowerCase().includes(chunk.toLowerCase())) return true;
    }
    if (fields.stk && raw.includes(fields.stk)) return true;
    return !needle;
  }

  resolveContentTime(body, fields) {
    return (
      extractContentTime(body, this.keepSeconds) ||
      (fields?.content ? extractContentTime(fields.content, this.keepSeconds) : null) ||
      (fields?.content
        ? extractContentTime(`Nội dung: ${fields.content}`, this.keepSeconds)
        : null)
    );
  }

  async editTypeToTru(detailMsg, peer) {
    let msg = detailMsg;
    const flat = await this.getButtons(msg);
    const truBtn =
      flat.find((b) => /lo[aạ]i\s*giao\s*d[iị]ch\s*:\s*tr[uừ]\s*ti[eề]n/i.test(b.text)) ||
      flat.find((b) => /^tr[uừ]\s*ti[eề]n$/i.test(b.text)) ||
      flat.find(
        (b) => /tr[uừ]\s*ti[eề]n/i.test(b.text) && /lo[aạ]i|giao\s*d[iị]ch/i.test(b.text)
      );
    if (!truBtn) {
      throw new Error(
        `Không thấy nút Trừ tiền. Buttons: ${flat.map((b) => b.text).join(' | ') || '(không)'}`
      );
    }
    const Utils = require('./utils');
    Utils.log(`${this.label} click Trừ tiền: ${truBtn.text}`);
    msg = await this.clickButton(msg, truBtn.text, peer);
    await sleep(1000);
    for (let i = 0; i < 8; i++) {
      const confirm =
        (await this.findFlipConfirmMessage(peer)) ||
        (this.isFlipConfirmScreen(await this.getLatestMessage(peer))
          ? await this.getLatestMessage(peer)
          : null);
      if (confirm) return confirm;
      await sleep(600);
    }
    return (await this.getLatestMessage(peer)) || msg;
  }

  async afterFlipBackThenReopenForTime(confirmMsg, peer, fields, page, session) {
    let msg =
      confirmMsg ||
      (await this.findFlipConfirmMessage(peer)) ||
      (await this.getLatestMessage(peer));
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
    const Utils = require('./utils');
    Utils.log(`${this.label} màn xác nhận Trừ → Quay lại: ${backBtn.text}`);
    msg = await this.clickButton(msg, backBtn.text, peer);
    await sleep(1200);

    for (let i = 0; i < 6; i++) {
      let detail = await this.findDetailMessage(peer);
      if (!detail) detail = await this.getLatestMessage(peer);
      if (detail && (await this.messageHasTimeButton(detail))) {
        const body = String(detail.message || detail.text || '');
        const info = bodyAmountInfo(body);
        if (
          /S[uử]a\s*Giao\s*D[iị]ch\s*#/i.test(body) &&
          (this.detailMatchesItem(body, fields) ||
            (info && info.sign === '-') ||
            /tr[uừ]\s*ti[eề]n/i.test(body))
        ) {
          return { detail, body, page };
        }
      }
      await sleep(700);
    }

    msg = await this.ensureTxList(msg, peer);
    msg = await this.goToFirstTxPageSafe(msg, peer);
    const nav = await this.goToTxPageSafe(msg, peer, 1);
    session.listMsg = nav.msg;
    session.lastMsg = nav.msg;
    const found = await this.findAndOpenListItem(session, fields, session.controlChatId);
    if (!found) {
      throw new Error('Sau đổi Trừ + Quay lại, không mở lại được GD để sửa thời gian');
    }
    return found;
  }

  async goToFirstTxPageSafe(msg, peer) {
    msg = await this.ensureTxList(msg, peer);
    for (let i = 0; i < 20; i++) {
      const info = this.parseLsgdPage(msg);
      if (info?.page === 1) return msg;
      const flat = await this.getButtons(msg);
      const prev = this.findPagerPrevSafe(flat);
      if (!prev) break;
      msg = await this.clickButton(msg, prev.text, peer);
      await sleep(600);
      msg =
        (await this.findTxListMessage(peer)) ||
        (await this.getLatestMessage(peer)) ||
        msg;
    }
    return msg;
  }

  async goToTxPageSafe(msg, peer, targetPage) {
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
        const next = this.findPagerNextSafe(flat);
        if (!next) return { msg, page: cur, total };
        msg = await this.clickButton(msg, next.text, peer);
        await sleep(700);
        msg =
          (await this.findTxListMessage(peer)) ||
          (await this.getLatestMessage(peer)) ||
          msg;
        continue;
      }
      const prev = this.findPagerPrevSafe(flat);
      if (!prev) return { msg, page: cur, total };
      msg = await this.clickButton(msg, prev.text, peer);
      await sleep(700);
      msg =
        (await this.findTxListMessage(peer)) ||
        (await this.getLatestMessage(peer)) ||
        msg;
    }
    const info = this.parseLsgdPage(msg);
    return { msg, page: info?.page || 1, total: info?.total || null };
  }

  async findAndOpenListItem(session, fields, controlChatId) {
    const { peer, replyTo } = session;
    const Utils = require('./utils');
    let msg = session.listMsg || session.lastMsg || (await this.getLatestMessage(peer));
    msg = await this.ensureTxList(msg, peer);
    msg = await this.goToFirstTxPageSafe(msg, peer);
    msg = await this.ensureTxList(msg, peer);
    const startInfo = this.parseLsgdPage(msg);
    Utils.log(
      `${this.label} tìm GD ${fields.amountDigits || '?'} từ trang ${startInfo?.page || '?'}/${startInfo?.total || '?'}`
    );

    let page = 1;
    let knownTotal = this.parseLsgdPage(msg)?.total || null;
    const maxPages = knownTotal || 20;

    for (let p = 0; p < maxPages; p++) {
      const nav = await this.goToTxPageSafe(msg, peer, page);
      msg = nav.msg;
      page = nav.page || page;
      if (nav.total) knownTotal = nav.total;

      const flat = await this.getButtons(msg);
      const txButtons = flat.filter((b) => this.isLikelyTransactionButton(b.text));
      for (const btn of txButtons) {
        const labelDigits = (
          (btn.text.match(/(\d[\d.,]*)\s*đ/i) || [])[1] || ''
        ).replace(/\D/g, '');
        if (
          fields.amountDigits &&
          labelDigits &&
          labelDigits !== fields.amountDigits
        ) {
          continue;
        }

        let detail = await this.clickAt(msg, btn.row, btn.col, peer);
        // Chờ chi tiết thật nếu latest stale
        if (!/S[uử]a\s*Giao\s*D[iị]ch\s*#/i.test(String(detail?.message || detail?.text || ''))) {
          detail = (await this.findDetailMessage(peer)) || detail;
        }
        let body = String(detail?.message || detail?.text || '');
        if (this.detailMatchesItem(body, fields)) {
          return { detail, body, page, msg };
        }
        const info = bodyAmountInfo(body);
        if (info && fields.amountDigits && info.digits === fields.amountDigits) {
          const wantT = this.resolveContentTime('', fields);
          const gotT = extractContentTime(body, this.keepSeconds);
          if ((wantT && gotT && wantT === gotT) || page === 1) {
            return { detail, body, page, msg };
          }
        }
        msg = await this.returnToTransactionList(detail, peer, { afterEdit: false });
        const backNav = await this.goToTxPageSafe(msg, peer, page);
        msg = backNav.msg;
      }

      if (knownTotal != null && page >= knownTotal) break;
      const flat2 = await this.getButtons(msg);
      const nextBtn = this.findPagerNextSafe(flat2);
      if (!nextBtn) break;
      const before = this.parseLsgdPage(msg)?.page || page;
      msg = await this.clickButton(msg, nextBtn.text, peer);
      await sleep(700);
      msg =
        (await this.findTxListMessage(peer)) ||
        (await this.getLatestMessage(peer)) ||
        msg;
      const after = this.parseLsgdPage(msg);
      if (!after || after.page <= before) break;
      page = after.page;
      if (after.total) knownTotal = after.total;
    }

    await this.notify(
      controlChatId,
      `⚠️ Không thấy GD khớp tiền ${fields.amountDigits || '?'} (đã về trang 1 rồi quét).`,
      replyTo
    );
    return null;
  }

  /** /wf1 + list (và WF4 pha B): tự chọn TK theo SĐT (còn hạn → hết hạn) rồi vào LSGD. */
  async autoPickAccountByPhone(controlChatId, items, replyTo) {
    const phones = this.phonesFromItems(items);
    if (!phones.length) throw new Error('List không có SĐT để chọn tài khoản.');
    const prev = this.getSession(controlChatId) || {};
    const keep = {
      peerA: prev.peerA,
      totalSentA: prev.totalSentA || 0,
      queuedText: prev.queuedText,
      lastItems: prev.lastItems,
      phabOnly: prev.phabOnly,
    };
    const peerCfg = this.getBotPeerConfig();
    const peer = await this.resolvePeer(peerCfg);

    // Giữ TK cũ nếu cùng SĐT (WF4 batch tiếp /phab)
    if (
      prev.chosenAccount &&
      prev.peer &&
      this.accountMatchesPhones(prev.chosenAccount, phones)
    ) {
      const session = {
        ...prev,
        ...keep,
        phase: 'processing',
        mode: 'annotated_list',
        peerCfg,
        peer: prev.peer || peer,
        controlChatId: String(controlChatId),
        replyTo,
        items,
        stats: {
          fixed: 0,
          skipped: 0,
          errors: 0,
          flipped: 0,
          fixedTime: 0,
          skippedFlip: 0,
          skippedTime: 0,
          sentA: prev.stats?.sentA || 0,
        },
        cancel: false,
        chosenAccount: prev.chosenAccount,
        chosenAccountFilter: prev.chosenAccountFilter,
        accountButtons: prev.accountButtons,
      };
      this.sessions.set(String(controlChatId), session);
      await this.notify(
        controlChatId,
        `♻️ Dùng lại TK: ${session.chosenAccount}`,
        replyTo
      );
      try {
        if (typeof this.openEditTxAfterAccount === 'function') {
          const msg = await this.openEditTxAfterAccount(controlChatId);
          session.listMsg = msg;
          session.lastMsg = msg;
        } else {
          let msg =
            session.listMsg ||
            session.lastMsg ||
            (await this.getLatestMessage(session.peer));
          try {
            msg = await this.ensureTxList(msg, session.peer);
          } catch (_e) {
            msg = await this.clickButton(msg, session.chosenAccount, session.peer);
            const flat = await this.getButtons(msg);
            if (findButton(flat, BTN.editTxMenu)) {
              msg = await this.clickButton(msg, BTN.editTxMenu, session.peer);
            }
            msg = await this.clickButton(msg, BTN.editTx, session.peer);
          }
          session.listMsg = msg;
          session.lastMsg = msg;
        }
        return session;
      } catch (e) {
        const Utils = require('./utils');
        Utils.log(`${this.label} reuse TK fail: ${e.message} — chọn lại`);
      }
    }

    const session = {
      ...keep,
      phase: 'processing',
      mode: 'annotated_list',
      peerCfg,
      peer,
      controlChatId: String(controlChatId),
      replyTo,
      items,
      stats: {
        fixed: 0,
        skipped: 0,
        errors: 0,
        flipped: 0,
        fixedTime: 0,
        skippedFlip: 0,
        skippedTime: 0,
        sentA: prev.stats?.sentA || 0,
      },
      cancel: false,
    };
    this.sessions.set(String(controlChatId), session);

    await this.notify(
      controlChatId,
      `📤 ${this.label} list: tìm TK SĐT \`${phones.join(', ')}\`…`,
      replyTo
    );
    let msg = await this.startAndClickFirstTwo(peer, controlChatId, replyTo);

    const flatFilters = await this.getButtons(msg);
    const filterBtns = flatFilters.filter((b) => BTN.accountFilter.test(b.text));
    if (!filterBtns.length) {
      throw new Error(
        `Không thấy còn hạn/hết hạn. Buttons: ${flatFilters.map((b) => b.text).join(' | ') || '(không)'}`
      );
    }
    const ordered = [...filterBtns].sort((a, b) => {
      const score = (t) =>
        /c[oò]n\s*h[aạ]n/i.test(t) ? 0 : /h[eế]t\s*h[aạ]n/i.test(t) ? 1 : 2;
      return score(a.text) - score(b.text);
    });

    for (let fi = 0; fi < ordered.length; fi++) {
      const filterBtn = ordered[fi];
      await this.notify(
        controlChatId,
        `🔎 Thử «${filterBtn.text}» — SĐT ${phones.join(', ')}…`,
        replyTo
      );
      msg = session.lastMsg || (await this.getLatestMessage(peer));
      const flatNow = await this.getButtons(msg);
      if (!flatNow.some((b) => BTN.accountFilter.test(b.text))) {
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
      const match = accountBtns.find((b) => this.accountMatchesPhones(b.text, phones));
      if (match) {
        session.chosenAccount = match.text;
        session.chosenAccountFilter = filterBtn.text;
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
          replyTo
        );
        msg = await this.clickButton(msg, match.text, peer);
        const flatAfter = await this.getButtons(msg);
        if (findButton(flatAfter, BTN.editTxMenu)) {
          msg = await this.clickButton(msg, BTN.editTxMenu, peer);
        }
        await this.notify(controlChatId, '👆 Chỉnh giao dịch…', replyTo);
        msg = await this.clickButton(msg, BTN.editTx, peer);
        session.listMsg = msg;
        session.lastMsg = msg;
        return session;
      }
      const backBtn =
        findButton(flatAcc, BTN.back) ||
        findButton(await this.getButtons(msg), BTN.back);
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

  async startAnnotatedListRepair(rawText, chatId, messageId) {
    if (!this.getBotPeerConfig()) {
      await this.bot.sendReply(
        chatId,
        messageId,
        `❌ Chưa đặt bot. Dùng: \`${this.cmdBot} @bot\`.`
      );
      return;
    }
    if (this.getSession(chatId)?.phase === 'processing') {
      await this.bot.sendReply(
        chatId,
        messageId,
        `⏳ ${this.label} đang chạy — \`${this.cmd} off\` rồi gửi lại.`
      );
      return;
    }

    let items;
    try {
      items = extractAnnotatedItems(rawText);
    } catch (e) {
      await this.bot.sendReply(chatId, messageId, `❌ Format list: ${e.message}`);
      return;
    }
    if (!items.length || !listHasPhone(items)) {
      await this.bot.sendReply(
        chatId,
        messageId,
        '❗ Cần list `N. Cộng|Trừ` + `/bdsd …` có SĐT.'
      );
      return;
    }

    const nCong = items.filter((i) => i.kind === 'cong').length;
    const nTru = items.filter((i) => i.kind === 'tru').length;
    await this.notify(
      chatId,
      [
        `🔧 **${this.label}** sửa theo list (logic pha B)`,
        `${items.length} mục · Cộng ${nCong} · Trừ ${nTru}`,
        'Tự chọn TK theo SĐT → Trừ (nếu cần) → sửa giờ.',
      ].join('\n'),
      messageId
    );

    this.runAnnotatedListRepair(chatId, items, messageId).catch(async (err) => {
      this.clearSession(chatId);
      await this.notify(chatId, `❌ ${this.label} lỗi: ${err.message}`, messageId);
    });
  }

  /**
   * Sửa theo list Cộng/Trừ + /bdsd (logic pha B).
   * opts.continuous = true → WF4 giữ ON, gọi returnToAwaitList khi xong.
   */
  async runAnnotatedListRepair(controlChatId, items, replyTo, opts = {}) {
    const continuous = opts.continuous === true;
    const sentA = Number(opts.sentA || 0) || 0;
    const session = await this.autoPickAccountByPhone(controlChatId, items, replyTo);
    const { peer } = session;
    const total = items.length;
    const gapMs = 1500;
    if (sentA) session.stats.sentA = sentA;

    for (let i = 0; i < items.length; i++) {
      const s = this.getSession(controlChatId);
      if (!s || s.cancel) {
        await this.notify(controlChatId, `🛑 ${this.label} đã hủy.`, replyTo);
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

      try {
        const found = await this.findAndOpenListItem(s, fields, controlChatId);
        if (!found) {
          s.stats.errors += 1;
          await sleep(gapMs);
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
              `⏭️ [${i + 1}] Đã là Trừ — bỏ qua đổi loại`,
              replyTo
            );
          } else {
            const confirmMsg = await this.editTypeToTru(detail, peer);
            s.stats.flipped += 1;
            await this.notify(
              controlChatId,
              `✅ [${i + 1}] Đã đổi → Trừ\n↩️ Quay lại → Sửa Thời Gian…`,
              replyTo
            );
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

        if (!(await this.messageHasTimeButton(detail))) {
          const d2 = await this.findDetailMessage(peer);
          if (d2) {
            detail = d2;
            body = String(detail.message || detail.text || '');
          }
        }

        const contentTime = this.resolveContentTime(body, fields);
        const fieldTime = this.extractFieldTime(body);
        const rawField = extractFieldTimeRaw(body);
        if (!contentTime) {
          await this.notify(
            controlChatId,
            `⚠️ [${i + 1}] Không parse được giờ Nội dung — bỏ qua`,
            replyTo
          );
        } else if (shouldSkipTimeEdit(contentTime, fieldTime, rawField, this.keepSeconds)) {
          s.stats.skippedTime += 1;
          s.stats.skipped += 1;
          await this.notify(
            controlChatId,
            `⏭️ [${i + 1}] Giờ đã đúng (${contentTime})`,
            replyTo
          );
        } else {
          const fresh = await this.findDetailMessage(peer);
          if (fresh) detail = fresh;
          const beforeEditId = detail?.id || 0;
          const oldTime =
            this.extractFieldTime(String(detail?.message || detail?.text || '')) || null;
          detail = await this.editTimeOnDetail(detail, peer, contentTime);
          let rawAfter = extractFieldTimeRaw(String(detail?.message || detail?.text || ''));
          let fieldAfter = this.extractFieldTime(String(detail?.message || detail?.text || ''));
          if (
            !fieldMatchesTarget(rawAfter, fieldAfter, contentTime, this.keepSeconds)
          ) {
            detail =
              (await this.waitForUpdatedDetailTime(peer, contentTime, {
                beforeId: beforeEditId,
                oldTime,
              })) || detail;
            body = String(detail?.message || detail?.text || '');
            rawAfter = extractFieldTimeRaw(body);
            fieldAfter = this.extractFieldTime(body);
          }
          if (
            !fieldMatchesTarget(rawAfter, fieldAfter, contentTime, this.keepSeconds)
          ) {
            throw new Error(
              `Sau sửa vẫn lệch: \`${rawAfter || fieldAfter || '(trống)'}\` (cần \`${contentTime}\`)`
            );
          }
          s.stats.fixedTime += 1;
          s.stats.fixed += 1;
          await this.notify(
            controlChatId,
            `✅ [${i + 1}] Giờ → ${contentTime}`,
            replyTo
          );
        }

        let listMsg = await this.returnToTransactionList(detail, peer, {
          afterEdit: true,
        });
        const nav = await this.goToTxPageSafe(listMsg, peer, page || 1);
        s.listMsg = nav.msg;
        s.lastMsg = nav.msg;
      } catch (e) {
        s.stats.errors += 1;
        await this.notify(controlChatId, `❌ [${i + 1}] ${e.message}`, replyTo);
        try {
          const latest = await this.getLatestMessage(peer);
          let listMsg = await this.returnToTransactionList(latest, peer, {
            afterEdit: false,
          });
          const nav = await this.goToTxPageSafe(listMsg, peer, s.currentPage || 1);
          s.listMsg = nav.msg;
        } catch (_e) {
          /* ignore */
        }
      }
      if (i < items.length - 1) await sleep(gapMs);
    }

    const done = this.getSession(controlChatId);
    const st = done?.stats || {};
    const summary = [
      `🏁 ${this.label} list xong (${total} mục).`,
      continuous || sentA
        ? `Gửi A (batch): ${st.sentA || sentA || 0}`
        : null,
      `Đổi Trừ: ${st.flipped || 0} (bỏ qua ${st.skippedFlip || 0})`,
      `Sửa giờ: ${st.fixedTime || 0} (đã đúng ${st.skippedTime || 0})`,
      `Lỗi: ${st.errors || 0}`,
    ].filter(Boolean);

    if (continuous && typeof this.returnToAwaitList === 'function') {
      // Giữ lastItems + TK cho /phab / batch sau
      if (done) {
        done.lastItems = items.slice();
        done.stats = { ...st };
      }
      await this.returnToAwaitList(controlChatId, summary);
      return;
    }

    this.clearSession(controlChatId);
    await this.notify(controlChatId, summary.join('\n'), replyTo);
  }
}

module.exports = {
  WfRunner,
  Wf1Runner: WfRunner, // alias
  BTN,
  BDSD_LINE,
  KIND_LINE_RE,
  extractAnnotatedItems,
  extractWf4Items: extractAnnotatedItems,
  looksLikeAnnotatedList,
  looksLikeWf4List: looksLikeAnnotatedList,
  parseBdsdFields,
  contentNeedle,
  listHasPhone,
  listHasPhoneForPhaseB: listHasPhone,
  isWf1AnnotatedRepairMessage,
  extractContentTime,
  extractFieldTime,
  extractFieldTimeRaw,
  fieldTimeHasSeconds,
  shouldSkipTimeEdit,
  fieldMatchesTarget,
  labelAmountInfo,
  bodyAmountInfo,
  detailMatchesLabel,
  formatEditTime,
  parseAnyDateTimeInChunk,
  findButton,
  flattenButtons,
};
