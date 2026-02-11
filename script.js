// --- 1. ナビゲーションのスクロール制御 ---
const navbar = document.getElementById('navbar');
const navLogo = document.getElementById('nav-logo');
const navLinks = document.getElementById('nav-links');

window.addEventListener('scroll', () => {
    if (window.scrollY > 80) {
        navbar.classList.add('scrolled', 'bg-white', 'shadow-md', 'py-4', 'border-black/5');
        navbar.classList.remove('bg-transparent', 'py-8', 'border-transparent');
        navLogo.classList.add('text-black');
        navLogo.classList.remove('text-white');
        if (navLinks) {
            navLinks.classList.add('text-black/70');
            navLinks.classList.remove('text-white/80');
        }
    } else {
        navbar.classList.remove('scrolled', 'bg-white', 'shadow-md', 'py-4', 'border-black/5');
        navbar.classList.add('bg-transparent', 'py-8', 'border-transparent');
        navLogo.classList.add('text-white');
        navLogo.classList.remove('text-black');
        if (navLinks) {
            navLinks.classList.add('text-white/80');
            navLinks.classList.remove('text-black/70');
        }
    }
});

// --- 2. 予約カレンダー (月別・1年分・サーバー連携) ---
const calendarEl = document.getElementById('calendar');
const calMonthLabel = document.getElementById('cal-month-label');
const calPrev = document.getElementById('cal-prev');
const calNext = document.getElementById('cal-next');
const calDots = document.getElementById('cal-dots');

let calBookedSet = new Set();   // 'YYYY-MM-DD' の集合
let calCurrentMonth = new Date(); // 表示中の月
calCurrentMonth.setDate(1);

const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const WEEK_HEADS = ['月','火','水','木','金','土','日'];

// 予約済み日付をサーバーから取得
async function fetchBookedDates() {
    try {
        const res = await fetch('/api/reservations/dates');
        const data = await res.json();
        calBookedSet = new Set(data.booked || []);
    } catch (e) {
        console.error('booked dates fetch error', e);
    }
}

// カレンダー描画
function renderCalendar() {
    if (!calendarEl) return;
    calendarEl.innerHTML = '';

    const year = calCurrentMonth.getFullYear();
    const month = calCurrentMonth.getMonth(); // 0-based
    const today = new Date();
    today.setHours(0,0,0,0);

    // ヘッダーラベル
    if (calMonthLabel) calMonthLabel.textContent = `${year}年 ${MONTH_NAMES[month]}`;

    // 曜日ヘッダー
    WEEK_HEADS.forEach((d, i) => {
        const el = document.createElement('div');
        el.className = 'cal-head' + (i === 6 ? ' sun' : '') + (i === 5 ? ' sat' : '');
        el.textContent = d;
        calendarEl.appendChild(el);
    });

    // 月の1日の曜日 (月曜始まり: 0=月, 6=日)
    const firstDay = new Date(year, month, 1);
    let startDow = firstDay.getDay(); // 0=日, 1=月, ...
    startDow = startDow === 0 ? 6 : startDow - 1; // 月曜始まりに変換

    // 月の日数
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // 空セル
    for (let i = 0; i < startDow; i++) {
        const el = document.createElement('div');
        el.className = 'cal-cell empty';
        calendarEl.appendChild(el);
    }

    // 日付セル
    for (let d = 1; d <= daysInMonth; d++) {
        const el = document.createElement('div');
        const dateObj = new Date(year, month, d);
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dow = (startDow + d - 1) % 7; // 0=月, 5=土, 6=日

        let cls = 'cal-cell';

        if (dateObj < today) {
            cls += ' past';
        } else if (calBookedSet.has(dateStr)) {
            cls += ' booked';
        } else {
            cls += ' available';
            if (dow === 6) cls += ' sun';
            if (dow === 5) cls += ' sat';
        }

        // 今日マーカー
        if (dateObj.getTime() === today.getTime()) cls += ' today';

        el.className = cls;
        el.textContent = d;

        // 予約可能日クリック → フォームの日付に自動セット
        if (cls.includes('available')) {
            el.addEventListener('click', () => {
                const startInput = document.querySelector('#reserve-form [name="start"]');
                if (startInput) {
                    startInput.value = dateStr;
                    // 終了日も同日にセット（ユーザーが変更可能）
                    const endInput = document.querySelector('#reserve-form [name="end"]');
                    if (endInput && !endInput.value) endInput.value = dateStr;
                }
                // フォームを開く
                const openBtn = document.getElementById('open-reserve');
                if (openBtn) openBtn.click();
            });
        }

        calendarEl.appendChild(el);
    }

    // ドットナビ更新
    updateCalDots();
}

// 月の範囲制限（今月 〜 1年後）
function getMonthRange() {
    const now = new Date();
    const minMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const maxMonth = new Date(now.getFullYear() + 1, now.getMonth(), 1);
    return { minMonth, maxMonth };
}

function canGoPrev() {
    const { minMonth } = getMonthRange();
    const prev = new Date(calCurrentMonth.getFullYear(), calCurrentMonth.getMonth() - 1, 1);
    return prev >= minMonth;
}
function canGoNext() {
    const { maxMonth } = getMonthRange();
    const next = new Date(calCurrentMonth.getFullYear(), calCurrentMonth.getMonth() + 1, 1);
    return next <= maxMonth;
}

// ドットナビ（13ヶ月分: 今月 + 12ヶ月）
function updateCalDots() {
    if (!calDots) return;
    calDots.innerHTML = '';
    const { minMonth, maxMonth } = getMonthRange();

    for (let m = new Date(minMonth); m <= maxMonth; m.setMonth(m.getMonth() + 1)) {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'cal-dot';
        dot.title = `${m.getFullYear()}年${MONTH_NAMES[m.getMonth()]}`;
        if (m.getFullYear() === calCurrentMonth.getFullYear() && m.getMonth() === calCurrentMonth.getMonth()) {
            dot.classList.add('active');
        }
        const targetYear = m.getFullYear();
        const targetMonth = m.getMonth();
        dot.addEventListener('click', () => {
            calCurrentMonth = new Date(targetYear, targetMonth, 1);
            renderCalendar();
        });
        calDots.appendChild(dot);
    }

    // ボタン状態更新
    if (calPrev) calPrev.style.opacity = canGoPrev() ? '1' : '.3';
    if (calNext) calNext.style.opacity = canGoNext() ? '1' : '.3';
}

// ナビボタン
if (calPrev) calPrev.addEventListener('click', () => {
    if (!canGoPrev()) return;
    calCurrentMonth.setMonth(calCurrentMonth.getMonth() - 1);
    renderCalendar();
});
if (calNext) calNext.addEventListener('click', () => {
    if (!canGoNext()) return;
    calCurrentMonth.setMonth(calCurrentMonth.getMonth() + 1);
    renderCalendar();
});

// カレンダーを初期化してサーバーから予約状況を取得 → 描画
async function initCalendar() {
    await fetchBookedDates();
    renderCalendar();
}

// グローバルに公開（予約送信後にリフレッシュ用）
window.refreshCalendar = async function () {
    await fetchBookedDates();
    renderCalendar();
};

if (calendarEl) initCalendar();

// --- 3. AI コンシェルジュ機能 ---
const btnSend = document.getElementById('btn-send');
const btnSelectKey = document.getElementById('btn-select-key');
const chatInput = document.getElementById('chat-input');
const chatBox = document.getElementById('chat-box');

// APIキーの選択（既存の window.aistudio を使う UX はそのまま残す）
if (btnSelectKey) {
    btnSelectKey.addEventListener('click', async () => {
        if (window.aistudio) {
            await window.aistudio.openSelectKey();
            btnSelectKey.innerText = 'AI CONNECTED ✔';
            btnSelectKey.classList.replace('bg-orange-500', 'bg-black');
            alert('AIの準備が整いました。名護の旅について質問してください！');
        } else {
            alert('APIキー設定環境が見つかりません。サーバー経由での利用を検討してください。');
        }
    });
}

// 送信ボタンが押されたとき
async function handleSendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    addMessage('user', text);
    chatInput.value = '';

    const loadingId = 'loading-' + Date.now();
    addMessage('bot', 'AIコンシェルジュがプランを練っています...', loadingId);

    try {
        // クライアント側では直接 API キーを使わず、サーバー側エンドポイントを叩く設計にする。
        const res = await fetch('/api/genai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text })
        });

        if (!res.ok) throw new Error('server error');
        const data = await res.json();

        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();

        addMessage('bot', data.text || '応答がありませんでした。');
    } catch (error) {
        console.error(error);
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.innerText = 'AI機能が利用できません。サーバー側に /api/genai エンドポイントを用意してください。';
    }
}

// チャット吹き出しの追加
function addMessage(role, text, id = null) {
    const wrapper = document.createElement('div');
    wrapper.className = `chat-bubble flex ${role === 'user' ? 'justify-end' : 'justify-start'}`;
    if (id) wrapper.id = id;

    const inner = document.createElement('div');
    inner.className = `max-w-[90%] md:max-w-[80%] p-6 md:p-8 text-sm leading-relaxed shadow-sm ${
        role === 'user' ? 'bg-black text-white' : 'bg-white text-black border-l-4 border-orange-500'
    }`;
    
    inner.innerHTML = `
        <div class="text-[8px] font-black uppercase tracking-widest opacity-40 mb-3">
            ${role === 'user' ? 'Guest Query' : 'NAGO CAMP Guide'}
        </div>
        <div class="whitespace-pre-wrap">${text}</div>
    `;

    wrapper.appendChild(inner);
    chatBox.appendChild(wrapper);
    chatBox.scrollTop = chatBox.scrollHeight;
}

if (btnSend) btnSend.addEventListener('click', handleSendMessage);
if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSendMessage();
    });
}

// --- 4. 予約フォームのモーダル制御 & 送信 ---
const openReserveBtn = document.getElementById('open-reserve');
const reserveModal = document.getElementById('reserve-modal');
const closeReserveBtn = document.getElementById('close-reserve');
const cancelReserveBtn = document.getElementById('cancel-reserve');
const reserveForm = document.getElementById('reserve-form');
const reserveMessage = document.getElementById('reserve-message');

function openReserve() {
    reserveModal.classList.remove('hidden');
    reserveModal.classList.add('flex');
    reserveModal.setAttribute('aria-hidden', 'false');
}
function closeReserve() {
    reserveModal.classList.add('hidden');
    reserveModal.classList.remove('flex');
    reserveModal.setAttribute('aria-hidden', 'true');
    reserveMessage.innerText = '';
    reserveForm.reset();
    // プレビュー画像リセット
    ['front', 'back'].forEach(side => {
        const preview = document.getElementById(`preview-${side}`);
        const placeholder = document.getElementById(`upload-${side}-placeholder`);
        if (preview) { preview.classList.add('hidden'); preview.src = ''; }
        if (placeholder) placeholder.classList.remove('hidden');
    });
}

if (openReserveBtn) openReserveBtn.addEventListener('click', openReserve);
if (closeReserveBtn) closeReserveBtn.addEventListener('click', closeReserve);
if (cancelReserveBtn) cancelReserveBtn.addEventListener('click', closeReserve);

// 免許証プレビュー
['front', 'back'].forEach(side => {
    const input = document.getElementById(`license-${side}-input`);
    if (!input) return;
    input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        const preview = document.getElementById(`preview-${side}`);
        const placeholder = document.getElementById(`upload-${side}-placeholder`);
        if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            preview.src = url;
            preview.classList.remove('hidden');
            placeholder.classList.add('hidden');
        } else {
            // PDFなどはファイル名表示
            placeholder.innerHTML = `<span class="text-xs font-bold text-green-600">✓ ${file.name}</span>`;
        }
    });
});

// 貸渡契約書チェックボックス → 送信ボタン有効化
const yakkanCheckbox = document.getElementById('yakkan-agree');
const reserveSubmitBtn = document.getElementById('reserve-submit-btn');
if (yakkanCheckbox && reserveSubmitBtn) {
    yakkanCheckbox.addEventListener('change', () => {
        reserveSubmitBtn.disabled = !yakkanCheckbox.checked;
    });
}

// ── 約款モーダル制御 ──
(function () {
    const openBtn = document.getElementById('open-yakkan-btn');
    const modal = document.getElementById('yakkan-modal');
    const closeBtn = document.getElementById('close-yakkan-btn');
    const okBtn = document.getElementById('yakkan-understood-btn');
    const body = document.getElementById('yakkan-modal-body');
    if (!openBtn || !modal) return;

    let loaded = false;

    function openYakkan() {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        if (!loaded) {
            fetch('/yakkan-content.html')
                .then(r => r.ok ? r.text() : Promise.reject('fetch error'))
                .then(html => { body.innerHTML = html; loaded = true; })
                .catch(() => { body.innerHTML = '<p style="color:red;">読み込みに失敗しました。</p>'; });
        }
    }

    function closeYakkan() {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }

    openBtn.addEventListener('click', openYakkan);
    if (closeBtn) closeBtn.addEventListener('click', closeYakkan);
    if (okBtn) okBtn.addEventListener('click', closeYakkan);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeYakkan(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'flex') closeYakkan();
    });
})();

if (reserveForm) {
    reserveForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('reserve-submit-btn');
        submitBtn.disabled = true;
        submitBtn.innerText = '送信中...';
        reserveMessage.innerText = '';
        reserveMessage.className = 'text-sm mt-2 text-center font-bold';

        const formData = new FormData(reserveForm);

        // 日付バリデーション
        const start = formData.get('start');
        const end = formData.get('end');
        if (new Date(start) > new Date(end)) {
            reserveMessage.innerText = '終了日は開始日以降にしてください';
            reserveMessage.classList.add('text-red-500');
            submitBtn.disabled = false;
            submitBtn.innerText = '予約を送信';
            return;
        }

        try {
            const res = await fetch('/api/reserve', {
                method: 'POST',
                body: formData  // FormData (multipart) で送信
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '予約に失敗しました');
            reserveMessage.innerText = '✓ ' + (data.message || '予約を受け付けました');
            reserveMessage.classList.add('text-green-600');
            // カレンダーを即時更新
            if (window.refreshCalendar) window.refreshCalendar();
            setTimeout(closeReserve, 2500);
        } catch (err) {
            console.error(err);
            reserveMessage.innerText = err.message || '送信に失敗しました。もう一度お試しください。';
            reserveMessage.classList.add('text-red-500');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = '予約を送信';
        }
    });
}

// --- 5. 地図表示 (Leaflet) と POI ピン ---
// POI: 沖縄本島の道の駅10件（実座標）＋温泉/シャワーのサンプル
const poiList = [
    { id: 1, name: '道の駅 許田', category: 'michi', lat: 26.551944, lng: 127.969167, desc: '許田（きょだ） — 名護近郊の道の駅' },
    { id: 2, name: '道の駅 おおぎみ', category: 'michi', lat: 26.660833, lng: 128.102500, desc: 'おおぎみ村の道の駅（北部）' },
    { id: 3, name: '道の駅 いとまん', category: 'michi', lat: 26.138333, lng: 127.661111, desc: '糸満市の道の駅（南部）' },
    { id: 4, name: '道の駅 かでな', category: 'michi', lat: 26.368056, lng: 127.774167, desc: '嘉手納町の道の駅（展望台あり）' },
    { id: 5, name: '道の駅 喜名番所', category: 'michi', lat: 26.399444, lng: 127.758333, desc: '読谷村の道の駅（喜名番所）' },
    { id: 6, name: '道の駅 ぎのざ', category: 'michi', lat: 26.473611, lng: 127.951944, desc: '宜野座村の道の駅（未来ぎのざ）' },
    { id: 7, name: '道の駅 サンライズひがし', category: 'michi', lat: 26.630833, lng: 128.153611, desc: '東村の道の駅（サンライズひがし）' },
    { id: 8, name: '道の駅 豊崎', category: 'michi', lat: 26.157778, lng: 127.655278, desc: '豊見城市の道の駅（豊崎）' },
    { id: 9, name: '道の駅 やんばるパイナップルの丘 安波', category: 'michi', lat: 26.704444, lng: 128.280278, desc: '国頭村の道の駅（安波）' },
    { id: 10, name: '道の駅 ゆいゆい国頭', category: 'michi', lat: 26.731944, lng: 128.169444, desc: '国頭村の道の駅（ゆいゆい国頭）' },

    // シャワー設備（主に海水浴場） — 公開情報から主要ビーチを追加
    { id: 11, name: 'トロピカルビーチ', category: 'shower', lat: 26.2812680, lng: 127.7316961, desc: '宜野湾トロピカルビーチ（シャワーあり）' },
    { id: 12, name: 'アラハビーチ', category: 'shower', lat: 26.3042760, lng: 127.7585382, desc: '北谷アラハビーチ（シャワー・更衣室あり）' },
    { id: 13, name: 'サンセットビーチ（北谷）', category: 'shower', lat: 26.3133677, lng: 127.7550856, desc: '北谷サンセットビーチ（美浜）' },
    { id: 14, name: '波の上ビーチ', category: 'shower', lat: 26.2212939, lng: 127.6721517, desc: '那覇・波の上ビーチ（市街地のビーチ）' },
    { id: 15, name: '新原ビーチ（みーばる）', category: 'shower', lat: 26.1336897, lng: 127.7891425, desc: '南城市 新原ビーチ（シャワーあり）' },
    { id: 16, name: '残波ビーチ', category: 'shower', lat: 26.4353402, lng: 127.7159846, desc: '読谷村 残波ビーチ（シャワー設置）' },

    // 日帰り温泉・スパ（代表例）
    { id: 20, name: '琉球温泉 瀨長島ホテル 龍神の湯', category: 'onsen', lat: 26.1763046, lng: 127.6414336, desc: '瀨長島ホテル内「龍神の湯」（日帰り利用可）' },
    { id: 21, name: 'スパジャングリア', category: 'onsen', lat: 26.638800, lng: 127.9670942, desc: '北部のスパジャングリア（公的情報より）' },
    { id: 22, name: 'ジュラ紀温泉 美ら海の湯（ホテルオリオン本部）', category: 'onsen', lat: 26.698444, lng: 127.8793577, desc: 'ホテルオリオンモトブ リゾート＆スパ内の温泉（ユーザー提供情報）' }
    ,
    { id: 23, name: 'TERME VILLA ちゅらーゆ', category: 'onsen', lat: 26.3130599, lng: 127.7559098, desc: '北谷・美浜のスパ施設（TERME VILLA ちゅらーゆ）' },
    { id: 24, name: '天然温泉 さしきの猿人の湯', category: 'onsen', lat: 26.1645936, lng: 127.7706525, desc: '南城市の天然温泉 さしきの猿人の湯' },
    
    ,
    { id: 26, name: '暮らしの発酵スパ（EMウェルネスリゾート コスタビスタ沖縄）', category: 'onsen', lat: 26.3062758, lng: 127.7949084, desc: 'EMウェルネスリゾート コスタビスタ沖縄（暮らしの発酵スパ）' }
    ,
    { id: 27, name: '沖縄かりゆしビーチリゾート・オーシャンスパ（大展望 森の湯）', category: 'onsen', lat: 26.5259482, lng: 127.9300510, desc: '恩納村 沖縄かりゆしビーチリゾート内の外来利用可能な温浴施設（大展望 森の湯）' }
];
    
    // 北部シャワー施設・ネットカフェ等（ビーチ併設・24時間利用など）
    poiList.push(
        { id: 28, name: '快活CLUB 名護店', category: 'shower', lat: 26.6087746, lng: 127.9877215, desc: '快活CLUB 名護店 — 24時間営業のネットカフェ、シャワー有り' },
        { id: 29, name: '名護市 21世紀の森体育館', category: 'shower', lat: 26.59072, lng: 127.96925, desc: '名護市 21世紀の森公園内の体育館（有料でシャワー利用可能）' },
        { id: 30, name: '瀬底ビーチ（本部町）', category: 'shower', lat: 26.648803, lng: 127.8550143, desc: '瀬底ビーチ — ビーチ入口にシャワー有（有料）' },
        { id: 31, name: 'ミッションビーチ（恩納村）', category: 'shower', lat: 26.5187019, lng: 127.9074877, desc: 'ミッションビーチ — 温水シャワー（有料）' },
        { id: 32, name: '古宇利島の駅／ソラハシ', category: 'shower', lat: 26.6932, lng: 128.0145, desc: '今帰仁村 古宇利島の駅（ソラハシ）— コインシャワー利用可能' },
        { id: 33, name: 'オクマビーチ（国頭村）', category: 'shower', lat: 26.7420316, lng: 128.1564856, desc: 'オクマビーチ — ホテル隣接、温水シャワーあり' }
    );

    // 追加：オクマ周辺のサウナ施設（正確位置は後で差し替え可能）
    poiList.push({ id: 34, name: 'オクマ 展望浴場 シーサイドサウナ', category: 'onsen', lat: 26.7420316, lng: 128.1564856, desc: 'オクマの展望浴場「シーサイドサウナ」 — 外来利用可の想定。営業時間や料金は事前に各施設へ確認してください。' });

let map;
const layers = { michi: L.layerGroup(), shower: L.layerGroup(), onsen: L.layerGroup() };
const markersList = [];

function initMap() {
    const okinawaBounds = L.latLngBounds(
        [26.06, 127.3],  // 南西端
        [26.93, 128.35]  // 北東端
    );
    map = L.map('map', {
        center: [26.5, 127.82],
        zoom: 10,
        minZoom: 9,
        maxZoom: 17,
        maxBounds: okinawaBounds.pad(0.05),
        maxBoundsViscosity: 1.0,
        zoomControl: false,
        scrollWheelZoom: false,    // ページスクロールで誤ズーム防止
        dragging: !L.Browser.mobile, // モバイルでは初期ドラッグ無効
        tap: !L.Browser.mobile,
        touchZoom: false            // モバイルピンチズームも初期無効
    });
    // ズームコントロールを右下に配置
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // 沖縄本島全体が見えるようにフィット
    map.fitBounds(L.latLngBounds([26.08, 127.55], [26.88, 128.32]));

    // --- マップ操作ガード（タップで解除）---
    const guard = document.getElementById('map-touch-guard');
    let guardTimer = null;

    function activateMap() {
        if (guard) guard.classList.add('hidden');
        map.dragging.enable();
        map.touchZoom.enable();
        map.scrollWheelZoom.enable();
    }
    function deactivateMap() {
        if (guard) guard.classList.remove('hidden');
        if (L.Browser.mobile) {
            map.dragging.disable();
            map.touchZoom.disable();
        }
        map.scrollWheelZoom.disable();
    }

    // ガードタップでマップ操作有効化
    if (guard) {
        guard.addEventListener('click', activateMap);
        guard.addEventListener('touchend', (e) => {
            e.preventDefault();
            activateMap();
        });
    }

    // マップ外をタップしたらガード復活（モバイル）
    document.addEventListener('touchstart', (e) => {
        const mapEl = document.getElementById('map');
        if (mapEl && !mapEl.contains(e.target) && guard && !guard.contains(e.target)) {
            clearTimeout(guardTimer);
            guardTimer = setTimeout(deactivateMap, 200);
        }
    }, { passive: true });

    // デスクトップ: マップ外クリックでスクロールズーム無効化
    document.addEventListener('click', (e) => {
        const mapEl = document.getElementById('map');
        if (mapEl && !mapEl.contains(e.target)) {
            map.scrollWheelZoom.disable();
        }
    });
    // マップクリックでスクロールズーム有効化（デスクトップ）
    map.on('click', () => {
        map.scrollWheelZoom.enable();
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // カテゴリ別アイコン（外部のカラーマーカーを利用）
    const iconUrls = {
        michi: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
        onsen: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shower: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png'
    };
    const iconShadow = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-shadow.png';

    const icons = {};
    Object.keys(iconUrls).forEach(k => {
        icons[k] = new L.Icon({
            iconUrl: iconUrls[k],
            shadowUrl: iconShadow,
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });
    });

    // マーカー作成（カテゴリに応じて色分け）
    poiList.forEach(p => {
        const icon = icons[p.category] || icons.michi;
        const marker = L.marker([p.lat, p.lng], { icon });
        marker.bindPopup(`<strong>${p.name}</strong><br/>${p.desc}`);
        // ツールチップは大画面では常時表示、モバイルでは非表示にしてタップでポップアップ表示にする
        const showPermanentLabel = (typeof window !== 'undefined') ? window.innerWidth >= 700 : true;
        marker.bindTooltip(p.name, { permanent: showPermanentLabel, direction: 'right', className: 'poi-label' });
        // モバイルなどでタップしたときに確実に情報が見えるようポップアップを開く
        marker.on('click', () => { marker.openPopup(); });
        // store marker for dynamic updates
        markersList.push({ marker, name: p.name, category: p.category });
        if (p.category === 'michi') layers.michi.addLayer(marker);
        if (p.category === 'shower') layers.shower.addLayer(marker);
        if (p.category === 'onsen') layers.onsen.addLayer(marker);
    });

    // デフォルトで全部表示
    layers.michi.addTo(map);
    layers.shower.addTo(map);
    layers.onsen.addTo(map);

    // Update tooltip permanence on resize (debounced)
    let resizeTimer = null;
    function updateTooltips() {
        const showPermanent = window.innerWidth >= 700;
        markersList.forEach(item => {
            try {
                const { marker, name } = item;
                if (marker.getTooltip()) marker.unbindTooltip();
                marker.bindTooltip(name, { permanent: showPermanent, direction: 'right', className: 'poi-label' });
            } catch (e) { /* ignore */ }
        });
    }
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(updateTooltips, 120);
    });
}

function showOnly(category) {
    // 全レイヤー削除
    Object.values(layers).forEach(l => map.removeLayer(l));
    if (category === 'all') {
        Object.values(layers).forEach(l => l.addTo(map));
    } else {
        layers[category].addTo(map);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // map 初期化
    try { initMap(); } catch (e) { console.error('leaflet init error', e); }

    const btnMichi = document.getElementById('filter-michi');
    const btnShower = document.getElementById('filter-shower');
    const btnOnsen = document.getElementById('filter-onsen');
    const btnAll = document.getElementById('filter-all');

    const filterBtns = [btnMichi, btnShower, btnOnsen, btnAll];
    function setPressed(active) {
        const map = { michi: btnMichi, shower: btnShower, onsen: btnOnsen, all: btnAll };
        filterBtns.forEach(b => {
            if (!b) return;
            b.setAttribute('aria-pressed', 'false');
            b.classList.remove('filter-active');
        });
        const target = map[active];
        if (target) {
            target.setAttribute('aria-pressed', 'true');
            target.classList.add('filter-active');
        }
    }

    if (btnMichi) btnMichi.addEventListener('click', () => { showOnly('michi'); setPressed('michi'); });
    if (btnShower) btnShower.addEventListener('click', () => { showOnly('shower'); setPressed('shower'); });
    if (btnOnsen) btnOnsen.addEventListener('click', () => { showOnly('onsen'); setPressed('onsen'); });
    if (btnAll) btnAll.addEventListener('click', () => { showOnly('all'); setPressed('all'); });

    // keyboard activation for accessibility (Enter/Space) — buttons handle Enter by default, ensure Space works
    [btnMichi, btnShower, btnOnsen, btnAll].forEach(b => {
        if (!b) return;
        b.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); b.click(); }
        });
    });
});
