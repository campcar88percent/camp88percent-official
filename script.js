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

// --- 2. 予約カレンダー (月別・1年分・サーバー連携・範囲選択) ---
const calendarEl = document.getElementById('calendar');
const calMonthLabel = document.getElementById('cal-month-label');
const calPrev = document.getElementById('cal-prev');
const calNext = document.getElementById('cal-next');
const calDots = document.getElementById('cal-dots');

let calBookedSet = new Set();   // 'YYYY-MM-DD' の集合
let calCurrentMonth = new Date(); // 表示中の月
calCurrentMonth.setDate(1);

// 範囲選択の状態
let calSelStart = null; // 'YYYY-MM-DD'
let calSelEnd = null;   // 'YYYY-MM-DD'

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

// 日付文字列 → Date
function parseDate(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }

// 2つの日付間の日数
function daysBetween(a, b) {
    const d1 = parseDate(a), d2 = parseDate(b);
    return Math.round((d2 - d1) / 86400000) + 1; // 泊数ではなく日数
}

// 範囲内の全日付を取得
function datesInRange(startStr, endStr) {
    const dates = [];
    const d = parseDate(startStr);
    const end = parseDate(endStr);
    while (d <= end) {
        dates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
        d.setDate(d.getDate() + 1);
    }
    return dates;
}

// 範囲内に予約不可日があるかチェック
function hasBookedInRange(startStr, endStr) {
    const dates = datesInRange(startStr, endStr);
    return dates.some(d => calBookedSet.has(d));
}

// プラン判定 (泊数ベース: 日数-1)
function determinePlan(startStr, endStr) {
    const nights = daysBetween(startStr, endStr) - 1;
    if (nights >= 7) {
        return { plan: 'weekly', name: 'Weekly Plan', pricePerDay: 19000, nights };
    } else if (nights >= 4) {
        return { plan: 'medium', name: 'Medium Plan', pricePerDay: 22000, nights };
    } else {
        return { plan: 'short', name: 'Short Stay', pricePerDay: 26000, nights };
    }
}

// 日付フォーマット (M月D日)
function formatDateJP(str) {
    const d = parseDate(str);
    return `${d.getMonth()+1}月${d.getDate()}日`;
}

// UIの選択状態を更新
function updateSelectionUI() {
    const guideEl = document.getElementById('cal-selection-guide');
    const rangeEl = document.getElementById('cal-selected-range');
    const startLabel = document.getElementById('cal-start-label');
    const endLabel = document.getElementById('cal-end-label');
    const planBadge = document.getElementById('cal-plan-badge');
    const confirmArea = document.getElementById('cal-confirm-area');
    const planSummary = document.getElementById('cal-plan-summary');

    if (!calSelStart) {
        // 未選択
        if (guideEl) { guideEl.classList.remove('hidden'); guideEl.querySelector('p').textContent = '開始日をタップしてください'; }
        if (rangeEl) rangeEl.classList.add('hidden');
        if (confirmArea) confirmArea.classList.add('hidden');
        return;
    }

    if (calSelStart && !calSelEnd) {
        // 開始日のみ
        if (guideEl) { guideEl.classList.remove('hidden'); guideEl.querySelector('p').textContent = '終了日をタップしてください'; }
        if (rangeEl) { rangeEl.classList.remove('hidden'); rangeEl.classList.add('flex'); }
        if (startLabel) startLabel.textContent = formatDateJP(calSelStart);
        if (endLabel) endLabel.textContent = '-';
        if (planBadge) planBadge.classList.add('hidden');
        if (confirmArea) confirmArea.classList.add('hidden');
        return;
    }

    // 両方選択済
    if (guideEl) guideEl.classList.add('hidden');
    if (rangeEl) { rangeEl.classList.remove('hidden'); rangeEl.classList.add('flex'); }
    if (startLabel) startLabel.textContent = formatDateJP(calSelStart);
    if (endLabel) endLabel.textContent = formatDateJP(calSelEnd);

    // 予約不可チェック
    if (hasBookedInRange(calSelStart, calSelEnd)) {
        if (planBadge) {
            planBadge.classList.remove('hidden');
            planBadge.textContent = '予約不可';
            planBadge.className = 'ml-2 px-3 py-1 text-[11px] font-black uppercase tracking-wider rounded-full bg-red-100 text-red-600';
        }
        if (confirmArea) confirmArea.classList.add('hidden');
        // 1.5秒後にリセット
        setTimeout(() => {
            calSelStart = null;
            calSelEnd = null;
            renderCalendar();
            updateSelectionUI();
        }, 1500);
        return;
    }

    // プラン判定
    const info = determinePlan(calSelStart, calSelEnd);
    if (planBadge) {
        planBadge.classList.remove('hidden');
        if (info.plan === 'weekly') {
            planBadge.className = 'ml-2 px-3 py-1 text-[11px] font-black uppercase tracking-wider rounded-full bg-orange-100 text-orange-600';
            planBadge.textContent = `Weekly Plan ・ ${info.nights}泊`;
        } else if (info.plan === 'medium') {
            planBadge.className = 'ml-2 px-3 py-1 text-[11px] font-black uppercase tracking-wider rounded-full bg-blue-100 text-blue-600';
            planBadge.textContent = `Medium Plan ・ ${info.nights}泊`;
        } else {
            planBadge.className = 'ml-2 px-3 py-1 text-[11px] font-black uppercase tracking-wider rounded-full bg-black/10 text-black/70';
            planBadge.textContent = `Short Stay ・ ${info.nights}泊`;
        }
    }

    // 確定エリア表示
    if (confirmArea) confirmArea.classList.remove('hidden');
    if (planSummary) {
        const total = info.pricePerDay * info.nights;
        planSummary.innerHTML = `
            <p class="text-lg font-black mb-1">${info.name}</p>
            <p class="text-sm text-black/60">${formatDateJP(calSelStart)} 〜 ${formatDateJP(calSelEnd)}（${info.nights}泊）</p>
            <p class="text-2xl font-black mt-2">¥${total.toLocaleString()}<span class="text-sm text-black/40 font-bold ml-1">（税込）</span></p>
            <p class="text-xs text-black/40 mt-1">¥${info.pricePerDay.toLocaleString()}/日 × ${info.nights}泊</p>
        `;
    }
}

// リセットボタン
const calResetBtn = document.getElementById('cal-reset-btn');
if (calResetBtn) {
    calResetBtn.addEventListener('click', () => {
        calSelStart = null;
        calSelEnd = null;
        renderCalendar();
        updateSelectionUI();
    });
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

        // 選択範囲のハイライト
        if (calSelStart && dateStr === calSelStart) cls += ' cal-sel-start';
        if (calSelEnd && dateStr === calSelEnd) cls += ' cal-sel-end';
        if (calSelStart && calSelEnd && dateStr > calSelStart && dateStr < calSelEnd) cls += ' cal-sel-range';

        el.className = cls;
        el.textContent = d;

        // 予約可能日クリック → 範囲選択
        if (cls.includes('available')) {
            el.addEventListener('click', () => {
                if (!calSelStart || (calSelStart && calSelEnd)) {
                    // 新規選択開始（またはリセット後再選択）
                    calSelStart = dateStr;
                    calSelEnd = null;
                } else if (calSelStart && !calSelEnd) {
                    // 終了日選択
                    if (dateStr < calSelStart) {
                        // 開始日より前なら開始日を変更
                        calSelStart = dateStr;
                    } else if (dateStr === calSelStart) {
                        // 同日 → 1泊2日 (翌日を終了日に)
                        const next = new Date(parseDate(dateStr));
                        next.setDate(next.getDate() + 1);
                        const nextStr = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`;
                        calSelEnd = nextStr;
                    } else {
                        calSelEnd = dateStr;
                    }
                }
                renderCalendar();
                updateSelectionUI();
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

// --- 3. 予約フォームのモーダル制御 & 送信 ---
const openReserveBtn = document.getElementById('open-reserve');
const reserveModal = document.getElementById('reserve-modal');
const closeReserveBtn = document.getElementById('close-reserve');
const cancelReserveBtn = document.getElementById('cancel-reserve');
const reserveForm = document.getElementById('reserve-form');
const reserveMessage = document.getElementById('reserve-message');

function openReserve() {
    // 選択された日付をフォームにセット
    if (calSelStart && calSelEnd) {
        const startInput = document.querySelector('#reserve-form [name="start"]');
        const endInput = document.querySelector('#reserve-form [name="end"]');
        if (startInput) startInput.value = calSelStart;
        if (endInput) endInput.value = calSelEnd;

        // プラン情報をモーダルに表示
        const info = determinePlan(calSelStart, calSelEnd);
        const modalPlanInfo = document.getElementById('modal-plan-info');
        const modalPlanName = document.getElementById('modal-plan-name');
        const modalPlanDates = document.getElementById('modal-plan-dates');
        const modalPlanPrice = document.getElementById('modal-plan-price');
        const modalPlanDetail = document.getElementById('modal-plan-detail');
        if (modalPlanInfo) {
            modalPlanInfo.classList.remove('hidden');
            if (info.plan === 'weekly') {
                modalPlanInfo.className = 'mb-6 p-4 rounded-lg border-2 border-orange-500 bg-orange-50';
                if (modalPlanName) { modalPlanName.textContent = 'Weekly Plan'; modalPlanName.className = 'text-xs font-black uppercase tracking-[0.2em] text-orange-500'; }
            } else if (info.plan === 'medium') {
                modalPlanInfo.className = 'mb-6 p-4 rounded-lg border-2 border-blue-400 bg-blue-50';
                if (modalPlanName) { modalPlanName.textContent = 'Medium Plan'; modalPlanName.className = 'text-xs font-black uppercase tracking-[0.2em] text-blue-500'; }
            } else {
                modalPlanInfo.className = 'mb-6 p-4 rounded-lg border-2 border-black/20 bg-gray-50';
                if (modalPlanName) { modalPlanName.textContent = 'Short Stay'; modalPlanName.className = 'text-xs font-black uppercase tracking-[0.2em] text-black/60'; }
            }
            const total = info.pricePerDay * info.nights;
            if (modalPlanDates) modalPlanDates.textContent = `${formatDateJP(calSelStart)} 〜 ${formatDateJP(calSelEnd)}（${info.nights}泊）`;
            if (modalPlanPrice) modalPlanPrice.textContent = `¥${total.toLocaleString()}`;
            if (modalPlanDetail) modalPlanDetail.textContent = `¥${info.pricePerDay.toLocaleString()}/日 × ${info.nights}泊`;
        }
    }

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
    // モーダルプラン情報リセット
    const modalPlanInfo = document.getElementById('modal-plan-info');
    if (modalPlanInfo) modalPlanInfo.classList.add('hidden');
    // カレンダー選択リセット
    calSelStart = null;
    calSelEnd = null;
    renderCalendar();
    updateSelectionUI();
    // 送信ボタン無効化
    const yakkanCb = document.getElementById('yakkan-agree');
    const submitBtn = document.getElementById('reserve-submit-btn');
    if (yakkanCb) yakkanCb.checked = false;
    if (submitBtn) submitBtn.disabled = true;
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

// --- 4. 地図表示 (Leaflet) と POI データ (58件) ---
const poiList = [
    // ── 道の駅 (10件) ──
    { id: 1,   name: '道の駅 許田',                       category: 'michi',  lat: 26.551944,  lng: 127.969167,  desc: '許田（きょだ） — 名護近郊の道の駅' },
    { id: 2,   name: '道の駅 おおぎみ',                   category: 'michi',  lat: 26.660833,  lng: 128.102500,  desc: 'おおぎみ村の道の駅（北部）' },
    { id: 3,   name: '道の駅 いとまん',                   category: 'michi',  lat: 26.138333,  lng: 127.661111,  desc: '糸満市の道の駅（南部）' },
    { id: 4,   name: '道の駅 かでな',                     category: 'michi',  lat: 26.368056,  lng: 127.774167,  desc: '嘉手納町の道の駅（展望台あり）' },
    { id: 5,   name: '道の駅 喜名番所',                   category: 'michi',  lat: 26.399444,  lng: 127.758333,  desc: '読谷村の道の駅（喜名番所）' },
    { id: 6,   name: '道の駅 ぎのざ',                     category: 'michi',  lat: 26.473611,  lng: 127.951944,  desc: '宜野座村の道の駅（未来ぎのざ）' },
    { id: 7,   name: '道の駅 サンライズひがし',           category: 'michi',  lat: 26.630833,  lng: 128.153611,  desc: '東村の道の駅（サンライズひがし）' },
    { id: 8,   name: '道の駅 豊崎',                       category: 'michi',  lat: 26.157778,  lng: 127.655278,  desc: '豊見城市の道の駅（豊崎）' },
    { id: 9,   name: '道の駅 やんばるパイナップルの丘 安波', category: 'michi', lat: 26.704444, lng: 128.280278,  desc: '国頭村の道の駅（安波）' },
    { id: 10,  name: '道の駅 ゆいゆい国頭',               category: 'michi',  lat: 26.731944,  lng: 128.169444,  desc: '国頭村の道の駅（ゆいゆい国頭）' },

    // ── シャワー (12件) ──
    { id: 11,  name: 'トロピカルビーチ',                   category: 'shower', lat: 26.2812680, lng: 127.7316961, desc: '宜野湾トロピカルビーチ（シャワーあり）' },
    { id: 12,  name: 'アラハビーチ',                       category: 'shower', lat: 26.3042760, lng: 127.7585382, desc: '北谷アラハビーチ（シャワー・更衣室あり）' },
    { id: 13,  name: 'サンセットビーチ（北谷）',           category: 'shower', lat: 26.3133677, lng: 127.7550856, desc: '北谷サンセットビーチ（美浜）' },
    { id: 14,  name: '波の上ビーチ',                       category: 'shower', lat: 26.2212939, lng: 127.6721517, desc: '那覇・波の上ビーチ（市街地のビーチ）' },
    { id: 15,  name: '新原ビーチ（みーばる）',             category: 'shower', lat: 26.1336897, lng: 127.7891425, desc: '南城市 新原ビーチ（シャワーあり）' },
    { id: 16,  name: '残波ビーチ',                         category: 'shower', lat: 26.4353402, lng: 127.7159846, desc: '読谷村 残波ビーチ（シャワー設置）' },
    { id: 28,  name: '快活CLUB 名護店',                    category: 'shower', lat: 26.6087746, lng: 127.9877215, desc: '快活CLUB 名護店 — 24時間営業のネットカフェ、シャワー有り' },
    { id: 29,  name: '名護市 21世紀の森体育館',            category: 'shower', lat: 26.59072,   lng: 127.96925,   desc: '名護市 21世紀の森公園内の体育館（有料でシャワー利用可能）' },
    { id: 30,  name: '瀬底ビーチ（本部町）',               category: 'shower', lat: 26.648803,  lng: 127.8550143, desc: '瀬底ビーチ — ビーチ入口にシャワー有（有料）' },
    { id: 31,  name: 'ミッションビーチ（恩納村）',         category: 'shower', lat: 26.5187019, lng: 127.9074877, desc: 'ミッションビーチ — 温水シャワー（有料）' },
    { id: 32,  name: '古宇利島の駅／ソラハシ',             category: 'shower', lat: 26.6932,    lng: 128.0145,    desc: '今帰仁村 古宇利島の駅（ソラハシ）— コインシャワー利用可能' },
    { id: 33,  name: 'オクマビーチ（国頭村）',             category: 'shower', lat: 26.7420316, lng: 128.1564856, desc: 'オクマビーチ — ホテル隣接、温水シャワーあり' },

    // ── 温泉・サウナ (15件) ──
    { id: 20,  name: '琉球温泉 瀨長島ホテル 龍神の湯',    category: 'onsen',  lat: 26.1763046, lng: 127.6414336, desc: '瀨長島ホテル内「龍神の湯」（日帰り利用可）' },
    { id: 21,  name: 'スパジャングリア',                   category: 'onsen',  lat: 26.638800,  lng: 127.9670942, desc: '北部のスパジャングリア' },
    { id: 22,  name: 'ジュラ紀温泉 美ら海の湯（ホテルオリオン本部）', category: 'onsen', lat: 26.698444, lng: 127.8793577, desc: 'ホテルオリオンモトブ リゾート＆スパ内の温泉' },
    { id: 23,  name: 'TERME VILLA ちゅらーゆ',             category: 'onsen',  lat: 26.3130599, lng: 127.7559098, desc: '北谷・美浜のスパ施設（TERME VILLA ちゅらーゆ）' },
    { id: 24,  name: '天然温泉 さしきの猿人の湯',         category: 'onsen',  lat: 26.1645936, lng: 127.7706525, desc: '南城市の天然温泉 さしきの猿人の湯' },
    { id: 26,  name: '暮らしの発酵スパ（EMウェルネスリゾート コスタビスタ沖縄）', category: 'onsen', lat: 26.3062758, lng: 127.7949084, desc: 'EMウェルネスリゾート コスタビスタ沖縄（暮らしの発酵スパ）' },
    { id: 27,  name: '沖縄かりゆしビーチリゾート・オーシャンスパ（大展望 森の湯）', category: 'onsen', lat: 26.5259482, lng: 127.9300510, desc: '恩納村 沖縄かりゆしビーチリゾート内の外来利用可能な温浴施設（大展望 森の湯）' },
    { id: 34,  name: 'オクマ 展望浴場 シーサイドサウナ',   category: 'onsen',  lat: 26.7420316, lng: 128.1564856, desc: 'オクマの展望浴場「シーサイドサウナ」 — 外来利用可の想定' },
    { id: 35,  name: '亜熱帯サウナ',                       category: 'onsen',  lat: 26.6419,    lng: 127.9521,    desc: '亜熱帯サウナ — サウナ○（要予約）' },
    { id: 36,  name: 'タピックタラソセンター宜野座',       category: 'onsen',  lat: 26.4745,    lng: 127.9602,    desc: 'タピックタラソセンター宜野座 — サウナ○（水着着用）' },
    { id: 37,  name: 'エナジック 天然温泉アロマ',          category: 'onsen',  lat: 26.3500,    lng: 127.7340,    desc: 'エナジック 天然温泉アロマ — サウナ○' },
    { id: 38,  name: '伊計島温泉～黒潮の湯～',            category: 'onsen',  lat: 26.3977,    lng: 127.9914,    desc: '伊計島温泉～黒潮の湯～ — 貸切風呂（家族風呂）' },
    { id: 39,  name: '波之上の湯',                         category: 'onsen',  lat: 26.2187,    lng: 127.6696,    desc: '波之上の湯 — サウナ○' },
    { id: 40,  name: '三重城温泉 島人&海人の湯',           category: 'onsen',  lat: 26.2135,    lng: 127.6664,    desc: '三重城温泉 島人&海人の湯 — サウナ○' },
    { id: 41,  name: 'ワンノサウナ',                       category: 'onsen',  lat: 26.2106,    lng: 127.6736,    desc: 'ワンノサウナ — サウナ○（個室サウナあり）' },

    // ── キャンプ場 (21件) ──
    { id: 100, name: 'アダンビーチ',                       category: 'camp',   lat: 26.8209,    lng: 128.3135,    desc: 'アダンビーチ — 🚿○ 🔌× アクティビティ×' },
    { id: 101, name: 'やんばる学びの森',                   category: 'camp',   lat: 26.7230,    lng: 128.2650,    desc: 'やんばる学びの森 — 🚿○ 🔌× アクティビティ○' },
    { id: 102, name: '国頭村森林公園',                     category: 'camp',   lat: 26.7331,    lng: 128.1908,    desc: '国頭村森林公園 — 🚿○ 🔌× アクティビティ○' },
    { id: 103, name: '東村村民の森 つつじエコパーク',      category: 'camp',   lat: 26.6340,    lng: 128.1536,    desc: 'つつじエコパーク — 🚿○ 🔌○ アクティビティ○' },
    { id: 104, name: '又吉コーヒー園',                     category: 'camp',   lat: 26.6099,    lng: 128.1439,    desc: '又吉コーヒー園 — 🚿○ 🔌○ アクティビティ○' },
    { id: 105, name: '福地川海浜公園',                     category: 'camp',   lat: 26.6315,    lng: 128.1586,    desc: '福地川海浜公園 — 🚿○ 🔌× アクティビティ○' },
    { id: 106, name: '屋我地ビーチ',                       category: 'camp',   lat: 26.6570,    lng: 127.9527,    desc: '屋我地ビーチ — 🚿○ 🔌× アクティビティ○' },
    { id: 107, name: '今帰仁海辺のキャンプ場',             category: 'camp',   lat: 26.6583,    lng: 127.9905,    desc: '今帰仁海辺のキャンプ場 — 🚿○ 🔌○ アクティビティ○' },
    { id: 108, name: '古宇利島キャンプ庭園',               category: 'camp',   lat: 26.6975,    lng: 128.0130,    desc: '古宇利島キャンプ庭園 — 🚿○ 🔌○ アクティビティ×' },
    { id: 109, name: '今帰仁総合運動公園',                 category: 'camp',   lat: 26.6826,    lng: 127.9625,    desc: '今帰仁総合運動公園 — 🚿○ 🔌○ アクティビティ○' },
    { id: 110, name: 'カルストキャンプサイト',             category: 'camp',   lat: 26.6688,    lng: 127.9066,    desc: 'カルストキャンプサイト — 🚿○ 🔌× アクティビティ×' },
    { id: 111, name: '夕日の丘キャンプ場',                 category: 'camp',   lat: 26.6158,    lng: 127.9399,    desc: '夕日の丘キャンプ場 — 🚿○ 🔌× アクティビティ×' },
    { id: 112, name: '県民の森',                           category: 'camp',   lat: 26.5112,    lng: 127.9066,    desc: '県民の森 — 🚿○ 🔌× アクティビティ○' },
    { id: 113, name: '沖縄県総合運動公園',                 category: 'camp',   lat: 26.3285,    lng: 127.7735,    desc: '沖縄県総合運動公園 — 🚿○ 🔌× アクティビティ○' },
    { id: 114, name: 'ユインチホテル南城 キャンプ場',      category: 'camp',   lat: 26.1657,    lng: 127.7680,    desc: 'ユインチホテル南城 — 🚿○ 🔌× アクティビティ○' },
    { id: 115, name: 'くるくまキャンプサイト',             category: 'camp',   lat: 26.1563,    lng: 127.7960,    desc: 'くるくまキャンプサイト — 🚿○ 🔌× アクティビティ×' },
    { id: 116, name: 'NEOSアウトドアパーク南城',           category: 'camp',   lat: 26.1753,    lng: 127.8152,    desc: 'NEOSアウトドアパーク南城 — 🚿○ 🔌○ アクティビティ○' },
    { id: 117, name: '海ん道（うみんち）',                 category: 'camp',   lat: 26.1350,    lng: 127.6680,    desc: '海ん道（うみんち） — 🚿○ 🔌× アクティビティ○' },
    { id: 118, name: 'いへや愛ランドよねざき',             category: 'camp',   lat: 26.9973,    lng: 127.9364,    desc: 'いへや愛ランドよねざき（伊平屋島） — 🚿○ 🔌× アクティビティ○' },
    { id: 119, name: '伊江村青少年旅行村',                 category: 'camp',   lat: 26.7097,    lng: 127.8045,    desc: '伊江村青少年旅行村（伊江島） — 🚿○ 🔌× アクティビティ○' },
    { id: 120, name: '粟国島オートキャンプ場',             category: 'camp',   lat: 26.5880,    lng: 127.2295,    desc: '粟国島オートキャンプ場 — 🚿○ 🔌× アクティビティ○' }
];

let map;
const layers = { michi: L.layerGroup(), shower: L.layerGroup(), onsen: L.layerGroup(), camp: L.layerGroup() };
const markersList = [];

function initMap() {
    const okinawaBounds = L.latLngBounds(
        [26.06, 127.15],  // 南西端（粟国島含む）
        [27.05, 128.35]  // 北東端（伊平屋島含む）
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
        shower: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
        camp: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png'
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
        if (p.category === 'camp') layers.camp.addLayer(marker);
    });

    // デフォルトで全部表示
    layers.michi.addTo(map);
    layers.shower.addTo(map);
    layers.onsen.addTo(map);
    layers.camp.addTo(map);

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
    const btnCamp = document.getElementById('filter-camp');
    const btnAll = document.getElementById('filter-all');

    const filterBtns = [btnMichi, btnShower, btnOnsen, btnCamp, btnAll];
    function setPressed(active) {
        const btnMap = { michi: btnMichi, shower: btnShower, onsen: btnOnsen, camp: btnCamp, all: btnAll };
        filterBtns.forEach(b => {
            if (!b) return;
            b.setAttribute('aria-pressed', 'false');
            b.classList.remove('filter-active');
        });
        const target = btnMap[active];
        if (target) {
            target.setAttribute('aria-pressed', 'true');
            target.classList.add('filter-active');
        }
    }

    if (btnMichi) btnMichi.addEventListener('click', () => { showOnly('michi'); setPressed('michi'); });
    if (btnShower) btnShower.addEventListener('click', () => { showOnly('shower'); setPressed('shower'); });
    if (btnOnsen) btnOnsen.addEventListener('click', () => { showOnly('onsen'); setPressed('onsen'); });
    if (btnCamp) btnCamp.addEventListener('click', () => { showOnly('camp'); setPressed('camp'); });
    if (btnAll) btnAll.addEventListener('click', () => { showOnly('all'); setPressed('all'); });

    // keyboard activation for accessibility (Enter/Space) — buttons handle Enter by default, ensure Space works
    [btnMichi, btnShower, btnOnsen, btnCamp, btnAll].forEach(b => {
        if (!b) return;
        b.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); b.click(); }
        });
    });
});

// ======================================================
//  お問い合わせフォーム
// ======================================================
(function initContactForm() {
    const form = document.getElementById('contact-form');
    if (!form) return;

    const submitBtn = document.getElementById('contact-submit-btn');
    const resultEl = document.getElementById('contact-message-result');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (submitBtn.disabled) return;

        submitBtn.disabled = true;
        submitBtn.textContent = '送信中...';
        resultEl.textContent = '';
        resultEl.className = 'text-sm font-bold text-center';

        const data = {
            name: form.name.value.trim(),
            email: form.email.value.trim(),
            subject: form.subject.value.trim(),
            message: form.message.value.trim()
        };

        try {
            const res = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const json = await res.json();

            if (res.ok && json.ok) {
                resultEl.textContent = 'お問い合わせを送信しました。確認メールをご確認ください。';
                resultEl.classList.add('text-green-600');
                form.reset();
            } else {
                resultEl.textContent = json.error || '送信に失敗しました。';
                resultEl.classList.add('text-red-500');
            }
        } catch {
            resultEl.textContent = '通信エラーが発生しました。しばらくしてからお試しください。';
            resultEl.classList.add('text-red-500');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Message';
        }
    });
})();
