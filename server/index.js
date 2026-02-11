const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

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

// 静的ファイルをルートから配信
app.use(express.static(path.join(__dirname, '..')));
// アップロードファイルを /uploads パスで配信 (管理画面用)
app.use('/uploads', express.static(uploadsDir));

// --- OpenAI ---
app.post('/api/genai', async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });

  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: "あなたは沖縄県名護市のキャンピングカーレンタル『NAGO CAMP』の専属ガイドです。名護や世界自然遺産『やんばる』の魅力を語ってください。おすすめの車中泊スポット、地元民に愛される食堂、美しいビーチなどを、親しみやすく丁寧な日本語で提案してください。回答の最後には必ず『いってらっしゃい！』と添えてください。" },
        { role: 'user', content: prompt }
      ],
      max_tokens: 800,
      temperature: 0.8
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      }
    });

    const text = response.data.choices?.[0]?.message?.content || '';
    res.json({ text });
  } catch (err) {
    console.error(err.response?.data || err.message || err);
    res.status(500).json({ error: 'AI provider request failed' });
  }
});

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

// 予約送信 (免許証画像付き)
app.post('/api/reserve',
  upload.fields([
    { name: 'license_front', maxCount: 1 },
    { name: 'license_back', maxCount: 1 }
  ]),
  (req, res) => {
    const { name, email, phone, start, end } = req.body || {};
    if (!name || !email || !phone || !start || !end) {
      return res.status(400).json({ error: '必須項目が不足しています' });
    }
    if (new Date(start) > new Date(end)) {
      return res.status(400).json({ error: '終了日は開始日以降にしてください' });
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

    res.json({ ok: true, id: entry.id, message: '予約を受け付けました。確認メールをお送りします。' });
  }
);

// ======================================================
//  管理者 API
// ======================================================

// 簡易認証ミドルウェア
function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${ADMIN_PASS}`) {
    return res.status(401).json({ error: '管理者認証が必要です' });
  }
  next();
}

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

// Bind to 0.0.0.0 so other devices on the LAN can connect
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running: http://0.0.0.0:${PORT}`);
});
