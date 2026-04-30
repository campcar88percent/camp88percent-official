'use strict';

const express = require('express');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const nodemailer = require('nodemailer');
const helmet = require('helmet');
const compression = require('compression');

// ======================================================
//  定数
// ======================================================
const MS_PER_DAY = 86_400_000;
const RATE_WINDOW_MS = 15 * 60 * 1000;  // 15分
const RATE_MAX_RESERVE = 10;             // 予約API上限
const RATE_MAX_LOGIN = 5;                // ログイン試行上限
const RATE_CLEANUP_MS = 5 * 60 * 1000;  // クリーンアップ間隔
const MAX_RATE_ENTRIES = 10_000;         // メモリリーク防止
const FILE_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES = /jpeg|jpg|png|webp|heic|pdf/i;

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const ADMIN_PASS = process.env.ADMIN_PASS;
const ADMIN_COOKIE_NAME = 'admin_session';

if (!ADMIN_PASS) {
  console.error('⛔ ADMIN_PASS が環境変数に設定されていません。サーバーを起動できません。');
  process.exit(1);
}

// ======================================================
//  Express アプリ初期化
// ======================================================
const app = express();

// --- Helmet（セキュリティヘッダー一括設定）---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://unpkg.com", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://*.tile.openstreetmap.org", "https://unpkg.com", "https://raw.githubusercontent.com"],
      connectSrc: ["'self'", "https://api.stripe.com", "https://js.stripe.com", "https://m.stripe.network", "https://q.stripe.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false  // Leaflet tiles 用
}));

// --- 圧縮 ---
app.use(compression());

// --- JSON パーサー ---
app.use(express.json({ limit: '1mb' }));

// ======================================================
//  レート制限
// ======================================================
const rateLimitMap = new Map();

/**
 * IPベースのレート制限ミドルウェアを生成
 * @param {number} windowMs - ウィンドウ（ミリ秒）
 * @param {number} maxReqs - 最大リクエスト数
 * @returns {Function} Express ミドルウェア
 */
function rateLimit(windowMs, maxReqs) {
  return (req, res, next) => {
    if (rateLimitMap.size > MAX_RATE_ENTRIES) rateLimitMap.clear();
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const record = rateLimitMap.get(key) || { count: 0, start: now };
    if (now - record.start > windowMs) {
      record.count = 1;
      record.start = now;
    } else {
      record.count++;
    }
    rateLimitMap.set(key, record);
    if (record.count > maxReqs) {
      return res.status(429).json({ error: 'リクエスト回数が上限を超えました。しばらくお待ちください。' });
    }
    next();
  };
}

// 古いエントリを定期的にクリーンアップ
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, rec] of rateLimitMap) {
    if (now - rec.start > RATE_CLEANUP_MS * 2) rateLimitMap.delete(key);
  }
}, RATE_CLEANUP_MS);
cleanupTimer.unref();

// ======================================================
//  ユーティリティ
// ======================================================

/**
 * XSS防止のため文字列をサニタイズ
 * @param {*} str - 入力値
 * @returns {string} サニタイズ済み文字列
 */
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'&]/g, c => ({
    '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;'
  })[c]).trim().slice(0, 500);
}

/**
 * 暗号学的に安全なIDを生成
 * @returns {string} 一意のID
 */
function generateId() {
  return crypto.randomUUID();
}

/**
 * タイミング安全な文字列比較
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 電話番号の形式を検証
 * @param {string} phone
 * @returns {boolean}
 */
function isValidPhone(phone) {
  return /^[\d\-+() ]{8,20}$/.test(phone);
}

/**
 * Cookieヘッダをパース
 * @param {string} cookieHeader
 * @returns {Record<string,string>}
 */
function parseCookies(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return {};
  return cookieHeader.split(';').reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return acc;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) return acc;
    acc[key] = decodeURIComponent(val);
    return acc;
  }, {});
}

// ======================================================
//  メール設定
// ======================================================
let transporter = null;
if (SMTP_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  transporter.verify((err) => {
    if (err) console.error('[MAIL] SMTP 接続エラー:', err.message);
    else console.log('[MAIL] SMTP 接続OK — メール通知有効');
  });
} else {
  console.log('[MAIL] SMTP_PASS 未設定 — メール通知は無効（予約は保存されます）');
}

// ======================================================
//  ビジネスロジック
// ======================================================

/**
 * 宿泊日数からプランと日額を判定
 * @param {string} start - YYYY-MM-DD
 * @param {string} end - YYYY-MM-DD
 * @returns {{ name: string, pricePerDay: number, nights: number }}
 */
function determinePlan(start, end) {
  const nights = Math.round((new Date(end) - new Date(start)) / MS_PER_DAY);
  if (nights >= 7) return { name: 'Weekly Plan', pricePerDay: 19000, nights };
  if (nights >= 4) return { name: 'Medium Plan', pricePerDay: 22000, nights };
  return { name: 'Short Stay', pricePerDay: 26000, nights };
}

/**
 * 予約通知メール送信（管理者宛て）
 * @param {Object} entry - 予約データ
 */
async function sendReservationEmail(entry) {
  if (!transporter) return;
  const plan = determinePlan(entry.start, entry.end);
  const total = plan.pricePerDay * plan.nights;
  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;border:2px solid #111;border-radius:8px;overflow:hidden;">
      <div style="background:#111;color:#fff;padding:20px 24px;">
        <h1 style="margin:0;font-size:20px;letter-spacing:.05em;">🚐 88CAMPCAR — 新規予約</h1>
      </div>
      <div style="padding:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 0;color:#888;width:100px;">予約ID</td><td style="padding:8px 0;font-weight:700;">${entry.id}</td></tr>
          <tr><td style="padding:8px 0;color:#888;">お名前</td><td style="padding:8px 0;font-weight:700;">${entry.name}</td></tr>
          <tr><td style="padding:8px 0;color:#888;">メール</td><td style="padding:8px 0;"><a href="mailto:${entry.email}">${entry.email}</a></td></tr>
          <tr><td style="padding:8px 0;color:#888;">電話番号</td><td style="padding:8px 0;"><a href="tel:${entry.phone}">${entry.phone}</a></td></tr>
          <tr style="border-top:1px solid #eee;"><td style="padding:12px 0 8px;color:#888;">プラン</td><td style="padding:12px 0 8px;font-weight:700;color:#f97316;">${plan.name}</td></tr>
          <tr><td style="padding:8px 0;color:#888;">期間</td><td style="padding:8px 0;font-weight:700;">${entry.start} → ${entry.end}（${plan.nights}泊）</td></tr>
          <tr><td style="padding:8px 0;color:#888;">料金</td><td style="padding:8px 0;font-weight:700;font-size:18px;">¥${total.toLocaleString()}<span style="font-size:12px;color:#888;"> (¥${plan.pricePerDay.toLocaleString()}/日)</span></td></tr>
          <tr><td style="padding:8px 0;color:#888;">車両</td><td style="padding:8px 0;">${entry.vehicle}</td></tr>
          <tr><td style="padding:8px 0;color:#888;">免許証</td><td style="padding:8px 0;">${entry.licenseFront ? '表面 ✓' : '—'} / ${entry.licenseBack ? '裏面 ✓' : '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#888;">受付日時</td><td style="padding:8px 0;">${new Date(entry.createdAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</td></tr>
        </table>
        <div style="margin-top:20px;text-align:center;">
          <a href="${BASE_URL}/admin.html" style="display:inline-block;background:#111;color:#fff;padding:12px 28px;text-decoration:none;font-size:13px;font-weight:700;border-radius:6px;letter-spacing:.05em;">管理画面を開く →</a>
        </div>
      </div>
      <div style="background:#f8f8f8;padding:12px 24px;text-align:center;font-size:11px;color:#aaa;">
        88CAMPCAR Reservation System
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"88CAMPCAR" <${SMTP_USER}>`,
      to: ADMIN_EMAIL,
      subject: `【新規予約】${entry.name}様 ${entry.start}〜${entry.end}（${plan.name}）`,
      html
    });
    console.log(`[MAIL] 予約通知メール送信完了 → ${ADMIN_EMAIL}`);
  } catch (err) {
    console.error('[MAIL] メール送信エラー:', err.message);
  }
}

// ======================================================
//  データストア（JSONファイル）
// ======================================================
const reservationsFile = path.join(__dirname, '..', 'reservations.json');
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

/** 予約データを非同期で読み込み */
async function readReservations() {
  try {
    if (fs.existsSync(reservationsFile)) {
      const data = await fs.promises.readFile(reservationsFile, 'utf8');
      return JSON.parse(data || '[]');
    }
  } catch (e) {
    console.error('[DATA] 予約データ読み込みエラー:', e.message);
  }
  return [];
}

/** 予約データを非同期で書き込み（アトミック書き込み） */
async function writeReservations(list) {
  const tmpFile = reservationsFile + '.tmp';
  await fs.promises.writeFile(tmpFile, JSON.stringify(list, null, 2), 'utf8');
  await fs.promises.rename(tmpFile, reservationsFile);
}

/**
 * ダブルブッキングチェック
 * @param {string} start - YYYY-MM-DD
 * @param {string} end - YYYY-MM-DD
 * @param {string} [excludeId] - 除外するID
 * @param {Array} list - 予約リスト
 * @returns {boolean}
 */
function hasConflict(start, end, excludeId, list) {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return list.some(r => {
    if (excludeId && r.id === excludeId) return false;
    if (r.status === 'cancelled') return false;
    const rs = new Date(r.start).getTime();
    const re = new Date(r.end).getTime();
    return s < re && e > rs;
  });
}

// ======================================================
//  Multer 設定（免許証アップロード）
// ======================================================
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safeName = `${file.fieldname}_${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, safeName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: FILE_SIZE_LIMIT },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).replace('.', '').toLowerCase();
    if (ALLOWED_FILE_TYPES.test(ext) || ALLOWED_FILE_TYPES.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('許可されていないファイル形式です'));
    }
  }
});

// ======================================================
//  認証ミドルウェア
// ======================================================

/**
 * 管理者認証（タイミング安全比較）
 */
function adminAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const tokenFromHeader = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const tokenFromQuery = typeof req.query?.token === 'string' ? req.query.token : '';
  const cookies = parseCookies(req.headers.cookie || '');
  const tokenFromCookie = cookies[ADMIN_COOKIE_NAME] || '';
  const token = tokenFromHeader || tokenFromQuery || tokenFromCookie;
  if (!safeCompare(token, ADMIN_PASS)) {
    return res.status(401).json({ error: '管理者認証が必要です' });
  }
  next();
}

// ======================================================
//  静的ファイル配信
// ======================================================
app.use(express.static(path.join(__dirname, '..'), {
  dotfiles: 'deny',
  index: 'index.html',
  maxAge: '7d',            // 静的ファイルのキャッシュ
  etag: true,
  setHeaders: (res, filePath) => {
    // HTML は常に最新を取得
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// アップロードファイルは管理者認証必須
app.use('/uploads', adminAuth, express.static(uploadsDir));

// 管理者向け: 免許証画像の安全な配信（imgタグでも閲覧できるよう token クエリを許可）
app.get('/api/admin/license/:filename', adminAuth, async (req, res, next) => {
  try {
    const safeName = path.basename(req.params.filename || '');
    if (!safeName) return res.status(400).json({ error: 'ファイル名が不正です' });
    const fp = path.join(uploadsDir, safeName);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'ファイルが見つかりません' });
    res.sendFile(fp);
  } catch (err) {
    next(err);
  }
});

// ======================================================
//  ヘルスチェック
// ======================================================
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ======================================================
//  予約 API
// ======================================================

// 予約済み日付を返す（カレンダー表示用）
app.get('/api/reservations/dates', async (req, res, next) => {
  try {
    const list = (await readReservations()).filter(r => r.status !== 'cancelled');
    const booked = new Set();
    for (const r of list) {
      const s = new Date(r.start);
      const e = new Date(r.end);
      for (let d = new Date(s); d < e; d.setDate(d.getDate() + 1)) {
        booked.add(d.toISOString().slice(0, 10));
      }
    }
    res.json({ booked: [...booked] });
  } catch (err) {
    next(err);
  }
});

// 予約送信（免許証画像付き）— レート制限付き
app.post('/api/reserve',
  rateLimit(RATE_WINDOW_MS, RATE_MAX_RESERVE),
  upload.fields([
    { name: 'license_front', maxCount: 1 },
    { name: 'license_back', maxCount: 1 }
  ]),
  async (req, res, next) => {
    try {
      const name = sanitize(req.body?.name);
      const email = sanitize(req.body?.email);
      const phone = sanitize(req.body?.phone);
      const start = sanitize(req.body?.start);
      const end = sanitize(req.body?.end);

      // 必須項目チェック
      if (!name || !email || !phone || !start || !end) {
        return res.status(400).json({ error: '必須項目が不足しています' });
      }
      // メール形式チェック
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: '有効なメールアドレスを入力してください' });
      }
      // 電話番号チェック
      if (!isValidPhone(phone)) {
        return res.status(400).json({ error: '有効な電話番号を入力してください' });
      }
      // 日付形式チェック
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
        return res.status(400).json({ error: '日付形式が不正です' });
      }
      if (new Date(start) >= new Date(end)) {
        return res.status(400).json({ error: '終了日は開始日の翌日以降にしてください' });
      }
      // 過去の日付チェック
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (new Date(start) < today) {
        return res.status(400).json({ error: '過去の日付は指定できません' });
      }

      // 免許証アップロード必須（表裏）
      if (!req.files?.license_front?.[0] || !req.files?.license_back?.[0]) {
        return res.status(400).json({ error: '免許証の表面・裏面のアップロードは必須です' });
      }

      // ダブルブッキングチェック
      const list = await readReservations();
      if (hasConflict(start, end, null, list)) {
        return res.status(409).json({ error: 'ご指定の日程は既に予約済みです。別の日程をお選びください。' });
      }

      const entry = {
        id: generateId(),
        name,
        email,
        phone,
        start,
        end,
        vehicle: 'スーパーロングハイエース',
        licenseFront: req.files?.license_front?.[0]?.filename || null,
        licenseBack: req.files?.license_back?.[0]?.filename || null,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      list.push(entry);
      await writeReservations(list);

      // メール通知（非同期・エラーでも予約は成功）
      sendReservationEmail(entry).catch(err => console.error('[MAIL] err:', err.message));

      res.json({ ok: true, id: entry.id, message: '予約を受け付けました。確認メールをお送りします。' });
    } catch (err) {
      next(err);
    }
  }
);

// ======================================================
//  お問い合わせ API
// ======================================================
const RATE_MAX_CONTACT = 5; // 15分間に5件まで

/**
 * お問い合わせ自動返信メール送信（送信者宛て）
 * @param {Object} data - { name, email, subject, message }
 */
async function sendContactAutoReply(data) {
  if (!transporter) return;
  const text = `${data.name}様　お問い合わせありがとうございます。

お問い合わせ内容
----------------------------
お名前
${data.name}

メールアドレス
${data.email}

題名
${data.subject}

メッセージ本文
${data.message}

----------------------------

お問い合わせありがとうございました。
折り返し担当者よりご連絡させていただきますので、
しばらくお待ちください。

＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊
株式会社88PERCENT　88CAMPCARレンタルシステム
担当：鈴木　　mobile：080-85200-6929
${BASE_URL}
お問合せ 88per88cent@gmail.com
営業時間 9 時〜18 時（年中無休）
＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊

本メールは 88PERCENT　88CAMPCARレンタルシステム（${BASE_URL}）のお問い合わせフォームから送信されました`;

  try {
    await transporter.sendMail({
      from: `"88CAMPCAR" <${SMTP_USER}>`,
      to: data.email,
      subject: `【88CAMPCAR】お問い合わせありがとうございます — ${data.subject}`,
      text
    });
    console.log(`[MAIL] お問い合わせ自動返信送信完了 → ${data.email}`);
  } catch (err) {
    console.error('[MAIL] お問い合わせ自動返信エラー:', err.message);
  }
}

/**
 * お問い合わせ通知メール送信（管理者宛て）
 * @param {Object} data - { name, email, subject, message }
 */
async function sendContactNotification(data) {
  if (!transporter || !ADMIN_EMAIL) return;
  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;border:2px solid #111;border-radius:8px;overflow:hidden;">
      <div style="background:#111;color:#fff;padding:20px 24px;">
        <h1 style="margin:0;font-size:20px;letter-spacing:.05em;">✉️ 88CAMPCAR — 新規お問い合わせ</h1>
      </div>
      <div style="padding:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 0;color:#888;width:100px;">お名前</td><td style="padding:8px 0;font-weight:700;">${sanitize(data.name)}</td></tr>
          <tr><td style="padding:8px 0;color:#888;">メール</td><td style="padding:8px 0;"><a href="mailto:${sanitize(data.email)}">${sanitize(data.email)}</a></td></tr>
          <tr><td style="padding:8px 0;color:#888;">題名</td><td style="padding:8px 0;font-weight:700;">${sanitize(data.subject)}</td></tr>
          <tr style="border-top:1px solid #eee;"><td style="padding:12px 0 8px;color:#888;vertical-align:top;">本文</td><td style="padding:12px 0 8px;white-space:pre-wrap;">${sanitize(data.message)}</td></tr>
          <tr><td style="padding:8px 0;color:#888;">受信日時</td><td style="padding:8px 0;">${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</td></tr>
        </table>
        <div style="margin-top:20px;text-align:center;">
          <a href="mailto:${sanitize(data.email)}?subject=Re: ${encodeURIComponent(data.subject)}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;text-decoration:none;font-size:13px;font-weight:700;border-radius:6px;letter-spacing:.05em;">返信する →</a>
        </div>
      </div>
      <div style="background:#f8f8f8;padding:12px 24px;text-align:center;font-size:11px;color:#aaa;">
        88CAMPCAR Contact Form
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"88CAMPCAR" <${SMTP_USER}>`,
      to: ADMIN_EMAIL,
      replyTo: data.email,
      subject: `【お問い合わせ】${data.name}様 — ${data.subject}`,
      html
    });
    console.log(`[MAIL] お問い合わせ管理者通知送信完了 → ${ADMIN_EMAIL}`);
  } catch (err) {
    console.error('[MAIL] お問い合わせ管理者通知エラー:', err.message);
  }
}

// お問い合わせ送信 — レート制限付き
app.post('/api/contact',
  rateLimit(RATE_WINDOW_MS, RATE_MAX_CONTACT),
  async (req, res, next) => {
    try {
      const name = sanitize(req.body?.name);
      const email = sanitize(req.body?.email);
      const subject = sanitize(req.body?.subject);
      const message = (typeof req.body?.message === 'string' ? req.body.message : '').trim().slice(0, 5000);

      // 必須項目チェック
      if (!name || !email || !subject || !message) {
        return res.status(400).json({ error: '必須項目が不足しています' });
      }
      // メール形式チェック
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: '有効なメールアドレスを入力してください' });
      }

      const data = { name, email, subject, message };

      // 自動返信（送信者宛て）＋ 管理者通知を並行送信
      await Promise.allSettled([
        sendContactAutoReply(data),
        sendContactNotification(data)
      ]);

      res.json({ ok: true, message: 'お問い合わせを送信しました。確認メールをお送りしましたのでご確認ください。' });
    } catch (err) {
      next(err);
    }
  }
);

// ======================================================
//  管理者 API
// ======================================================

// 管理者ログイン検証（レート制限付き）
app.post('/api/admin/login',
  rateLimit(RATE_WINDOW_MS, RATE_MAX_LOGIN),
  (req, res) => {
    const { password } = req.body || {};
    if (!password || !safeCompare(password, ADMIN_PASS)) {
      return res.status(401).json({ error: 'パスワードが正しくありません' });
    }
    res.cookie(ADMIN_COOKIE_NAME, ADMIN_PASS, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 12 * 60 * 60 * 1000,
      path: '/'
    });
    res.json({ ok: true });
  }
);

// 管理者ログアウト
app.post('/api/admin/logout', (_req, res) => {
  res.clearCookie(ADMIN_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });
  res.json({ ok: true });
});

// 全予約取得
app.get('/api/admin/reservations', adminAuth, async (req, res, next) => {
  try {
    const list = (await readReservations()).sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    );
    res.json(list);
  } catch (err) {
    next(err);
  }
});

// 予約ステータス更新
app.patch('/api/admin/reservations/:id', adminAuth, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['pending', 'confirmed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: '無効なステータス' });
    }
    const list = await readReservations();
    const idx = list.findIndex(r => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '予約が見つかりません' });
    list[idx].status = status;
    list[idx].updatedAt = new Date().toISOString();
    await writeReservations(list);
    res.json({ ok: true, reservation: list[idx] });
  } catch (err) {
    next(err);
  }
});

// 予約削除
app.delete('/api/admin/reservations/:id', adminAuth, async (req, res, next) => {
  try {
    let list = await readReservations();
    const target = list.find(r => r.id === req.params.id);
    if (!target) return res.status(404).json({ error: '予約が見つかりません' });
    // 関連ファイル削除
    for (const f of [target.licenseFront, target.licenseBack]) {
      if (f) {
        const fp = path.join(uploadsDir, f);
        try { await fs.promises.unlink(fp); } catch { /* ファイルが存在しない場合は無視 */ }
      }
    }
    list = list.filter(r => r.id !== req.params.id);
    await writeReservations(list);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ======================================================
//  404 ハンドラ
// ======================================================
app.use((_req, res) => {
  res.status(404).json({ error: 'ページが見つかりません' });
});

// ======================================================
//  グローバルエラーハンドラ
// ======================================================
app.use((err, _req, res, _next) => {
  // Multer エラー
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'ファイルサイズが上限（10MB）を超えています' });
    }
    return res.status(400).json({ error: `アップロードエラー: ${err.message}` });
  }
  // バリデーションエラー
  if (err.message === '許可されていないファイル形式です') {
    return res.status(400).json({ error: err.message });
  }
  // それ以外の予期しないエラー
  console.error('[ERROR]', err.stack || err.message);
  res.status(500).json({ error: 'サーバーエラーが発生しました。しばらくしてからお試しください。' });
});

// ======================================================
//  サーバー起動 & グレースフルシャットダウン
// ======================================================
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] Running: http://0.0.0.0:${PORT}`);
});

function gracefulShutdown(signal) {
  console.log(`\n[SERVER] ${signal} 受信 — シャットダウン中...`);
  server.close(() => {
    clearInterval(cleanupTimer);
    console.log('[SERVER] 正常終了');
    process.exit(0);
  });
  // 10秒以内に終了しなければ強制終了
  setTimeout(() => {
    console.error('[SERVER] 強制終了');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
