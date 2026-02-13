const express = require('express');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const nodemailer = require('nodemailer');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render等リバースプロキシ対応

// --- セキュリティヘッダー ---
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '1mb' }));

// --- レート制限（予約API保護） ---
const rateLimitMap = new Map();
function rateLimit(windowMs, maxReqs) {
  return (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const record = rateLimitMap.get(ip) || { count: 0, start: now };
    if (now - record.start > windowMs) {
      record.count = 1; record.start = now;
    } else {
      record.count++;
    }
    rateLimitMap.set(ip, record);
    if (record.count > maxReqs) {
      return res.status(429).json({ error: 'リクエスト回数が上限を超えました。しばらくお待ちください。' });
    }
    next();
  };
}
// 古いエントリを定期的にクリーンアップ
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of rateLimitMap) {
    if (now - rec.start > 600000) rateLimitMap.delete(ip);
  }
}, 300000);

// --- 入力サニタイズ ---
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'&]/g, c => ({
    '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;'
  })[c]).trim().slice(0, 500);
}

const PORT = process.env.PORT || 3000;

// --- メール設定 ---
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '88per88cent@gmail.com';
const SMTP_USER = process.env.SMTP_USER || '88per88cent@gmail.com';
const SMTP_PASS = process.env.SMTP_PASS || ''; // Gmail アプリパスワード

let transporter = null;
if (SMTP_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  transporter.verify((err) => {
    if (err) console.error('SMTP 接続エラー:', err.message);
    else console.log('✉  SMTP 接続OK — メール通知有効');
  });
} else {
  console.log('⚠  SMTP_PASS 未設定 — メール通知は無効（予約は保存されます）');
}

// プラン判定
function determinePlan(start, end) {
  const nights = Math.round((new Date(end) - new Date(start)) / 86400000);
  if (nights >= 7) return { name: 'Weekly Plan', pricePerDay: 19000, nights };
  if (nights >= 4) return { name: 'Medium Plan', pricePerDay: 22000, nights };
  return { name: 'Short Stay', pricePerDay: 26000, nights };
}

// 予約通知メール送信
async function sendReservationEmail(entry) {
  if (!transporter) return;
  const plan = determinePlan(entry.start, entry.end);
  const total = plan.pricePerDay * plan.nights;
  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;border:2px solid #111;border-radius:8px;overflow:hidden;">
      <div style="background:#111;color:#fff;padding:20px 24px;">
        <h1 style="margin:0;font-size:20px;letter-spacing:.05em;">🚐 NAGO.CAMP — 新規予約</h1>
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
          <a href="${process.env.BASE_URL || 'http://localhost:3000'}/admin.html" style="display:inline-block;background:#111;color:#fff;padding:12px 28px;text-decoration:none;font-size:13px;font-weight:700;border-radius:6px;letter-spacing:.05em;">管理画面を開く →</a>
        </div>
      </div>
      <div style="background:#f8f8f8;padding:12px 24px;text-align:center;font-size:11px;color:#aaa;">
        NAGO.CAMP Reservation System
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"NAGO.CAMP" <${SMTP_USER}>`,
      to: ADMIN_EMAIL,
      subject: `【新規予約】${entry.name}様 ${entry.start}〜${entry.end}（${plan.name}）`,
      html
    });
    console.log(`✉  予約通知メール送信完了 → ${ADMIN_EMAIL}`);
  } catch (err) {
    console.error('メール送信エラー:', err.message);
  }
}

// --- ファイルパス ---
const reservationsFile = path.join(__dirname, '..', 'reservations.json');
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// --- 管理者パスワード (本番では環境変数を使用) ---
const ADMIN_PASS = process.env.ADMIN_PASS || 'nagocamp2026';

// --- Multer 設定 (免許証アップロード) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const prefix = file.fieldname; // license_front or license_back
    cb(null, `${prefix}_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|heic|pdf/i;
    const ext = path.extname(file.originalname).replace('.', '');
    if (allowed.test(ext) || allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('許可されていないファイル形式です'));
    }
  }
});

// --- ヘルパー: 予約データ読み書き ---
function readReservations() {
  try {
    if (fs.existsSync(reservationsFile)) {
      return JSON.parse(fs.readFileSync(reservationsFile, 'utf8') || '[]');
    }
  } catch (e) { console.error('read reservations err', e); }
  return [];
}
function writeReservations(list) {
  fs.writeFileSync(reservationsFile, JSON.stringify(list, null, 2), 'utf8');
}

// --- ダブルブッキングチェック ---
function hasConflict(start, end, excludeId) {
  const list = readReservations();
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return list.some(r => {
    if (excludeId && r.id === excludeId) return false;
    if (r.status === 'cancelled') return false;
    const rs = new Date(r.start).getTime();
    const re = new Date(r.end).getTime();
    return s < re && e > rs; // 期間が重なる
  });
}

// --- 管理者認証ミドルウェア ---
function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${ADMIN_PASS}`) {
    return res.status(401).json({ error: '管理者認証が必要です' });
  }
  next();
}

// 静的ファイルをルートから配信（.env, .git, uploads を除外）
app.use(express.static(path.join(__dirname, '..'), {
  dotfiles: 'deny',
  index: 'index.html'
}));
// アップロードファイルは管理者認証必須
app.use('/uploads', adminAuth, express.static(uploadsDir));

// ======================================================
//  予約 API
// ======================================================

// 予約済み日付を返す (カレンダー表示用)
app.get('/api/reservations/dates', (req, res) => {
  const list = readReservations().filter(r => r.status !== 'cancelled');
  const booked = [];
  list.forEach(r => {
    const s = new Date(r.start);
    const e = new Date(r.end);
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      booked.push(d.toISOString().slice(0, 10));
    }
  });
  res.json({ booked: [...new Set(booked)] });
});

// 予約送信 (免許証画像付き) — レート制限: 15分に10件まで
app.post('/api/reserve',
  rateLimit(15 * 60 * 1000, 10),
  upload.fields([
    { name: 'license_front', maxCount: 1 },
    { name: 'license_back', maxCount: 1 }
  ]),
  (req, res) => {
    const name = sanitize(req.body?.name);
    const email = sanitize(req.body?.email);
    const phone = sanitize(req.body?.phone);
    const start = sanitize(req.body?.start);
    const end = sanitize(req.body?.end);
    if (!name || !email || !phone || !start || !end) {
      return res.status(400).json({ error: '必須項目が不足しています' });
    }
    // メール形式チェック
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: '有効なメールアドレスを入力してください' });
    }
    // 日付形式チェック
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return res.status(400).json({ error: '日付形式が不正です' });
    }
    if (new Date(start) > new Date(end)) {
      return res.status(400).json({ error: '終了日は開始日以降にしてください' });
    }
    // 過去の日付チェック
    const today = new Date(); today.setHours(0,0,0,0);
    if (new Date(start) < today) {
      return res.status(400).json({ error: '過去の日付は指定できません' });
    }

    // ダブルブッキングチェック
    if (hasConflict(start, end)) {
      return res.status(409).json({ error: 'ご指定の日程は既に予約済みです。別の日程をお選びください。' });
    }

    // 免許証ファイル名
    const licenseFront = req.files?.license_front?.[0]?.filename || null;
    const licenseBack = req.files?.license_back?.[0]?.filename || null;

    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      email,
      phone,
      start,
      end,
      vehicle: 'スーパーロングハイエース',
      licenseFront,
      licenseBack,
      status: 'pending',   // pending | confirmed | cancelled
      createdAt: new Date().toISOString()
    };

    const list = readReservations();
    list.push(entry);
    writeReservations(list);

    // メール通知（非同期・エラーでも予約は成功）
    sendReservationEmail(entry).catch(err => console.error('mail err', err));

    res.json({ ok: true, id: entry.id, message: '予約を受け付けました。確認メールをお送りします。' });
  }
);

// ======================================================
//  管理者 API
// ======================================================

// 全予約取得
app.get('/api/admin/reservations', adminAuth, (req, res) => {
  const list = readReservations().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list);
});

// 予約ステータス更新
app.patch('/api/admin/reservations/:id', adminAuth, (req, res) => {
  const { status } = req.body;
  if (!['pending', 'confirmed', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: '無効なステータス' });
  }
  const list = readReservations();
  const idx = list.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '予約が見つかりません' });
  list[idx].status = status;
  list[idx].updatedAt = new Date().toISOString();
  writeReservations(list);
  res.json({ ok: true, reservation: list[idx] });
});

// 予約削除
app.delete('/api/admin/reservations/:id', adminAuth, (req, res) => {
  let list = readReservations();
  const target = list.find(r => r.id === req.params.id);
  if (!target) return res.status(404).json({ error: '予約が見つかりません' });
  // 関連ファイル削除
  [target.licenseFront, target.licenseBack].forEach(f => {
    if (f) {
      const fp = path.join(uploadsDir, f);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
  });
  list = list.filter(r => r.id !== req.params.id);
  writeReservations(list);
  res.json({ ok: true });
});

const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`Server running: http://${HOST}:${PORT}`);
});
