'use strict';

/* =========================================================
   ぱっとみえ! — フォトリーディング・トレーニングゲーム
   ========================================================= */

/* ---------- カードデータ ---------- */
const SHAPE_COLORS = [
  ['あか', '#E63946'], ['あお', '#457B9D'], ['きいろ', '#F4B41A'], ['みどり', '#52B69A'],
];
const SHAPE_KINDS = [
  ['まる', 'circle'], ['さんかく', 'triangle'], ['しかく', 'square'], ['ほし', 'star'], ['ハート', 'heart'],
];
const SHAPE_ITEMS = [];
for (const [cname, color] of SHAPE_COLORS) {
  for (const [sname, shape] of SHAPE_KINDS) {
    SHAPE_ITEMS.push({ shape, color, name: cname + sname });
  }
}

const CATEGORIES = {
  animals:  { label: 'どうぶつ', items: ['🐶','🐱','🐭','🐰','🦊','🐻','🐼','🐸','🐷','🐮','🦁','🐘','🦒','🐟','🐦','🐢','🐵','🐨','🐯','🦆'] },
  foods:    { label: 'たべもの', items: ['🍎','🍌','🍇','🍓','🍉','🍊','🥕','🌽','🍞','🍙','🍜','🍕','🍰','🍩','🍦','🍪','🍅','🥐','🍑','🍬'] },
  vehicles: { label: 'のりもの', items: ['🚗','🚌','🚒','🚑','🚓','🚜','🚲','🛴','🚂','✈️','🚁','🚀','⛵','🚢','🛵','🚚','🚕','🚛','🛶','🚠'] },
  shapes:   { label: 'かたち・いろ', items: SHAPE_ITEMS },
  mix:      { label: 'ミックス', items: [] }, // 実行時に他カテゴリから合成
};

const ZUKAN = [
  ['🐣','ひよこ'], ['🐬','いるか'], ['🦄','ユニコーン'], ['🚂','きかんしゃ'],
  ['🌈','にじ'], ['🦖','きょうりゅう'], ['🍭','キャンディ'], ['🐧','ペンギン'],
  ['🚁','ヘリコプター'], ['🦋','ちょうちょ'], ['⭐','おほしさま'], ['🐳','くじら'],
  ['🎪','サーカス'], ['🦜','オウム'], ['🍉','すいか'], ['🚀','ロケット'],
  ['🧸','くまさん'], ['🌻','ひまわり'], ['🦩','フラミンゴ'], ['🎠','メリーゴーランド'],
  ['🐙','たこさん'], ['👑','おうかん'], ['🛸','ユーフォー'], ['🏰','おしろ'],
];
const ZUKAN_COST = 6; // 星6個ごとに1つ解放

/* おまかせモードの難易度ラダー: [列, 行, 記憶秒] */
const LEVELS = [
  [2,2,10],[2,3,10],[2,3,5],[3,3,10],[3,3,5],[3,4,15],
  [3,4,10],[3,4,5],[4,4,15],[4,4,10],[4,4,5],[4,4,3],
  [5,4,15],[5,4,10],[5,4,5],
];

/* ---------- 保存(プロフィールごと) ---------- */
const DEFAULT_SETTINGS = {
  grid: '2x3', time: 10, category: 'animals', reveal: 'seq',
  seqLen: 3, seqInterval: 1, auto: true, sound: true, bgm: true, voice: true,
  timeLimit: 0, // 1日の上限(分)。0=なし
};
const DEFAULT_PROGRESS = { stars: 0, level: 0, winStreak: 0, loseStreak: 0 };
const DEFAULT_RECORDS = { games: [], daily: {} }; // games: 1プレイ1件, daily: 日付→プレイ秒数
const AVATARS = ['🐻','🐰','🐱','🐶','🦁','🐼','🦄','🐸'];

function load(key, def) {
  try { return { ...def, ...JSON.parse(localStorage.getItem(key) || '{}') }; }
  catch { return { ...def }; }
}

let profiles = load('pr_profiles', { list: [], activeId: null });
let settings, progress, records;

// 初回またはv1.0からの移行: プロフィール1を作り、既存データを引き継ぐ
if (!profiles.list.length) {
  const p = { id: 'p' + Date.now(), name: 'プレイヤー1', avatar: '🐻' };
  profiles = { list: [p], activeId: p.id };
  for (const [oldKey, newKey] of [['pr_settings', 'pr_settings_' + p.id], ['pr_progress', 'pr_progress_' + p.id]]) {
    const v = localStorage.getItem(oldKey);
    if (v) { localStorage.setItem(newKey, v); localStorage.removeItem(oldKey); }
  }
  localStorage.setItem('pr_profiles', JSON.stringify(profiles));
}

function loadProfileData() {
  settings = load('pr_settings_' + profiles.activeId, DEFAULT_SETTINGS);
  if (settings.grid === '4x5') settings.grid = '5x4'; // 旧バージョンからの移行
  progress = load('pr_progress_' + profiles.activeId, DEFAULT_PROGRESS);
  records = load('pr_records_' + profiles.activeId, DEFAULT_RECORDS);
}
loadProfileData();

function saveSettings() { localStorage.setItem('pr_settings_' + profiles.activeId, JSON.stringify(settings)); }
function saveProgress() { localStorage.setItem('pr_progress_' + profiles.activeId, JSON.stringify(progress)); }
function saveRecords() { localStorage.setItem('pr_records_' + profiles.activeId, JSON.stringify(records)); }
function saveProfiles() { localStorage.setItem('pr_profiles', JSON.stringify(profiles)); }
function activeProfile() { return profiles.list.find(p => p.id === profiles.activeId); }

function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addGameRecord(mode, correct, total, label) {
  records.games.push({ d: dateKey(), mode, correct, total, label });
  if (records.games.length > 500) records.games = records.games.slice(-500);
  saveRecords();
}

/* プレイ時間の計測と1日の上限 */
function flushPlayTime() {
  const now = Date.now();
  let secs = 0;
  if (Game.startedAt) { secs += (now - Game.startedAt) / 1000; Game.startedAt = null; }
  if (Seq.startedAt) { secs += (now - Seq.startedAt) / 1000; Seq.startedAt = null; }
  if (secs > 0) {
    records.daily[dateKey()] = Math.round((records.daily[dateKey()] || 0) + secs);
    saveRecords();
  }
}
function isTimeUp() {
  return settings.timeLimit > 0 && (records.daily[dateKey()] || 0) >= settings.timeLimit * 60;
}
function showTimeUp() {
  $('#timeup-overlay').classList.remove('hidden');
  speak('きょうはおしまい!またあしたあそぼうね');
}

/* ---------- サウンド ---------- */
let audioCtx = null;
let bgmTimer = null;
let bgmGainNode = null;

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function tone(freq, dur = 0.12, type = 'sine', gain = 0.15, delay = 0) {
  if (!settings.sound || !audioCtx) return;
  const t = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type; osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(t); osc.stop(t + dur + 0.05);
}

const SFX = {
  pop()     { tone(620, 0.09, 'sine', 0.14); tone(930, 0.09, 'sine', 0.1, 0.05); },
  pick()    { tone(440, 0.07, 'triangle', 0.12); },
  snap()    { tone(780, 0.08, 'sine', 0.16); },
  back()    { tone(300, 0.1, 'sine', 0.1); },
  flip()    { tone(500, 0.06, 'triangle', 0.08); tone(350, 0.06, 'triangle', 0.08, 0.06); },
  correct() { tone(880, 0.12, 'sine', 0.16); tone(1318, 0.16, 'sine', 0.14, 0.1); },
  wrongSoft(){ tone(330, 0.18, 'sine', 0.07); },
  fanfare() {
    [[523,0],[659,0.13],[784,0.26],[1046,0.4]].forEach(([f,d]) => tone(f, 0.22, 'triangle', 0.16, d));
    tone(1318, 0.4, 'triangle', 0.12, 0.55);
  },
};

/* BGM: ゆったりしたペンタトニックのループ */
const BGM_NOTES = [523, 587, 659, 784, 880, 784, 659, 587];
let bgmStep = 0;
function startBGM() {
  if (!settings.bgm || bgmTimer || !audioCtx) return;
  bgmGainNode = audioCtx.createGain();
  bgmGainNode.gain.value = 0.035;
  bgmGainNode.connect(audioCtx.destination);
  bgmTimer = setInterval(() => {
    if (!settings.bgm) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = BGM_NOTES[bgmStep % BGM_NOTES.length];
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    osc.connect(g).connect(bgmGainNode);
    osc.start(t); osc.stop(t + 1);
    bgmStep++;
  }, 1000);
}
function stopBGM() {
  if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
}
function setBGMQuiet(quiet) {
  if (bgmGainNode) bgmGainNode.gain.value = quiet ? 0.012 : 0.035;
}

/* ---------- 音声ガイド ---------- */
/* 明るい女性の声を優先して選ぶ。
   iPad: 「Kyoko(拡張)」があれば最も自然。設定 > アクセシビリティ > 読み上げコンテンツ > 声 > 日本語
   からダウンロードできる。男性声(Otoya/Hattori)は避ける。 */
let cachedVoice = null;
const FEMALE_VOICE_PRIORITY = ['kyoko (enhanced)', 'kyoko(拡張)', 'kyoko', 'o-ren', 'google 日本語'];
const MALE_VOICE_NAMES = ['otoya', 'hattori'];

function pickVoice() {
  if (cachedVoice) return cachedVoice;
  const jaVoices = speechSynthesis.getVoices().filter(v => v.lang.replace('_', '-').startsWith('ja'));
  if (!jaVoices.length) return null;
  for (const wanted of FEMALE_VOICE_PRIORITY) {
    const v = jaVoices.find(v => v.name.toLowerCase().includes(wanted));
    if (v) { cachedVoice = v; return v; }
  }
  cachedVoice = jaVoices.find(v => !MALE_VOICE_NAMES.some(m => v.name.toLowerCase().includes(m))) || jaVoices[0];
  return cachedVoice;
}
if ('speechSynthesis' in window) {
  speechSynthesis.addEventListener?.('voiceschanged', () => { cachedVoice = null; });
}

function speak(text) {
  if (!settings.voice || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  // 表示用の単語間スペースは読み上げがぶつ切りになるので除去する
  const u = new SpeechSynthesisUtterance(text.replace(/ /g, ''));
  u.lang = 'ja-JP';
  u.rate = 1.0; u.pitch = 1.25; // 明るく元気な調子に
  const v = pickVoice();
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

/* ---------- ユーティリティ ---------- */
const $ = (sel) => document.querySelector(sel);
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pickItems(categoryKey, count) {
  let pool;
  if (categoryKey === 'mix') {
    pool = [...CATEGORIES.animals.items, ...CATEGORIES.foods.items, ...CATEGORIES.vehicles.items];
  } else {
    pool = CATEGORIES[categoryKey].items;
  }
  return shuffle(pool).slice(0, count);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function shapeSVG(shape, color) {
  const paths = {
    circle: `<circle cx="50" cy="50" r="40" fill="${color}"/>`,
    square: `<rect x="14" y="14" width="72" height="72" rx="10" fill="${color}"/>`,
    triangle: `<path d="M50 12 L92 84 L8 84 Z" fill="${color}"/>`,
    star: `<path d="M50 6 L61 38 L95 38 L67 58 L78 91 L50 71 L22 91 L33 58 L5 38 L39 38 Z" fill="${color}"/>`,
    heart: `<path d="M50 86 C22 62 8 44 16 28 C24 13 44 16 50 30 C56 16 76 13 84 28 C92 44 78 62 50 86 Z" fill="${color}"/>`,
  };
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${paths[shape]}</svg>`;
}

function faceHTML(item, sizePx) {
  if (typeof item === 'string') {
    return `<span class="emoji" style="font-size:${Math.round(sizePx * 0.62)}px">${item}</span>`;
  }
  return shapeSVG(item.shape, item.color);
}

/* ---------- 画面遷移 ---------- */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $('#' + id).classList.add('active');
  if (id === 'screen-home') {
    $('#home-star-count').textContent = progress.stars;
    speechSynthesis?.cancel?.();
  }
}

/* =========================================================
   フォトリーディング ゲーム
   ========================================================= */
const Game = {
  state: 'idle',       // present | memorize | place | check | result
  cols: 2, rows: 3, time: 10,
  items: [],           // カード絵柄(index = カードid = 正解セル)
  cardEls: [],
  cardLoc: [],         // カードidごとの位置 {loc:'cell'|'tray', idx}
  cellRects: [], trayRects: [],
  csGrid: 0, csTray: 0, // グリッド側・トレイ側のカードサイズ(独立)
  timerTimeout: null,
  startedAt: null,
};

function currentDifficulty() {
  if (settings.auto) {
    const lv = Math.max(0, Math.min(LEVELS.length - 1, progress.level));
    const [c, r, t] = LEVELS[lv];
    return { cols: c, rows: r, time: t };
  }
  const [c, r] = settings.grid.split('x').map(Number);
  return { cols: c, rows: r, time: settings.time };
}

function computeLayout() {
  const area = $('#play-area').getBoundingClientRect();
  const W = area.width, H = area.height;
  const n = Game.cols * Game.rows;
  const gap = 12, pad = 14;

  // 20枚(5×4)のときはグリッド領域を広げてカードを大きくする
  const gridShare = n >= 20 ? 0.66 : 0.62;
  const gridRegionW = W * gridShare - pad * 2;
  const trayRegionW = W * (0.96 - gridShare) - pad * 2;
  const regionH = H - pad * 2;

  // グリッド側のカードサイズはグリッド領域だけで決める(トレイに縛られない)
  const csGrid = Math.floor(Math.min(
    (gridRegionW - gap * (Game.cols - 1)) / Game.cols,
    (regionH - gap * (Game.rows - 1)) / Game.rows,
    170,
  ));

  // トレイ側は列数2〜4を試して、最もカードが大きくなる配置を選ぶ
  let csTray = 0, trayCols = 2;
  for (let c = 2; c <= 4; c++) {
    const r = Math.ceil(n / c);
    const s = Math.min(
      (trayRegionW - gap * (c - 1)) / c,
      (regionH - gap * (r - 1)) / r,
    );
    if (s > csTray) { csTray = s; trayCols = c; }
  }
  csTray = Math.floor(Math.min(csTray, csGrid));
  const trayRows = Math.ceil(n / trayCols);

  Game.csGrid = csGrid;
  Game.csTray = csTray;

  // グリッドセル座標(グリッド領域の中央に配置)
  const gridW = Game.cols * csGrid + (Game.cols - 1) * gap;
  const gridH = Game.rows * csGrid + (Game.rows - 1) * gap;
  const gx0 = pad + (gridRegionW - gridW) / 2;
  const gy0 = (H - gridH) / 2;
  Game.cellRects = [];
  for (let r = 0; r < Game.rows; r++) {
    for (let c = 0; c < Game.cols; c++) {
      Game.cellRects.push({ x: gx0 + c * (csGrid + gap), y: gy0 + r * (csGrid + gap), s: csGrid });
    }
  }

  // トレイスロット座標(右側領域の中央)
  const trayW = trayCols * csTray + (trayCols - 1) * gap;
  const trayH = trayRows * csTray + (trayRows - 1) * gap;
  const tx0 = W * (gridShare + 0.02) + (trayRegionW - trayW) / 2;
  const ty0 = (H - trayH) / 2;
  Game.trayRects = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / trayCols), c = i % trayCols;
    Game.trayRects.push({ x: tx0 + c * (csTray + gap), y: ty0 + r * (csTray + gap), s: csTray });
  }
}

function renderBoards() {
  const gridLayer = $('#grid-layer');
  const trayLayer = $('#tray-layer');
  gridLayer.innerHTML = '';
  trayLayer.innerHTML = '';
  for (const rc of Game.cellRects) {
    const d = document.createElement('div');
    d.className = 'grid-cell';
    Object.assign(d.style, { left: rc.x + 'px', top: rc.y + 'px', width: rc.s + 'px', height: rc.s + 'px' });
    gridLayer.appendChild(d);
  }
  for (const rc of Game.trayRects) {
    const d = document.createElement('div');
    d.className = 'tray-slot';
    Object.assign(d.style, { left: rc.x + 'px', top: rc.y + 'px', width: rc.s + 'px', height: rc.s + 'px' });
    trayLayer.appendChild(d);
  }
}

function makeCardEl(item, id) {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.id = id;
  el.style.width = Game.csGrid + 'px';
  el.style.height = Game.csGrid + 'px';
  el.innerHTML = `
    <div class="card-inner">
      <div class="card-face card-front">${faceHTML(item, Game.csGrid)}</div>
      <div class="card-face card-back"></div>
    </div>`;
  attachDrag(el);
  return el;
}

// 位置と同時にサイズも移動先に合わせる(グリッドとトレイでカードサイズが違うため)
function placeCardAt(el, rect, animate = true) {
  if (!animate) el.classList.add('no-anim');
  el.style.left = rect.x + 'px';
  el.style.top = rect.y + 'px';
  el.style.width = rect.s + 'px';
  el.style.height = rect.s + 'px';
  const em = el.querySelector('.emoji');
  if (em) em.style.fontSize = Math.round(rect.s * 0.62) + 'px';
  if (!animate) {
    void el.offsetWidth; // reflow
    el.classList.remove('no-anim');
  }
}

async function startGame() {
  if (isTimeUp()) { showTimeUp(); return; }
  const d = currentDifficulty();
  Game.cols = d.cols; Game.rows = d.rows; Game.time = d.time;
  Game.state = 'present';
  Game.startedAt = Date.now();
  showScreen('screen-game');
  $('#btn-memorized').classList.add('hidden');
  $('#btn-done').classList.add('hidden');
  $('#timer-wrap').classList.add('hidden');
  $('#game-message').textContent = 'よくみて おぼえてね';
  $('#card-layer').innerHTML = '';

  computeLayout();
  renderBoards();

  const n = Game.cols * Game.rows;
  Game.items = pickItems(settings.category, n);
  Game.cardEls = [];
  Game.cardLoc = [];

  speak('よくみて おぼえてね');

  // ① カードを1枚ずつ(または一斉に)提示
  for (let i = 0; i < n; i++) {
    if (Game.state !== 'present') return; // 中断された
    const el = makeCardEl(Game.items[i], i);
    el.classList.add('pop-in');
    placeCardAt(el, Game.cellRects[i], false);
    Game.cardEls.push(el);
    Game.cardLoc.push({ loc: 'cell', idx: i });
    if (settings.reveal === 'seq') {
      $('#card-layer').appendChild(el);
      SFX.pop();
      await sleep(320);
    } else {
      $('#card-layer').appendChild(el);
    }
  }
  if (settings.reveal === 'all') SFX.pop();
  if (Game.state !== 'present') return; // 中断された

  // ② 記憶タイム
  Game.state = 'memorize';
  setBGMQuiet(true);
  $('#btn-memorized').classList.remove('hidden');
  if (Game.time > 0) {
    const wrap = $('#timer-wrap');
    const bar = $('#timer-bar');
    wrap.classList.remove('hidden');
    bar.style.transition = 'none';
    bar.style.width = '100%';
    void bar.offsetWidth;
    bar.style.transition = `width ${Game.time}s linear`;
    bar.style.width = '0%';
    Game.timerTimeout = setTimeout(endMemorize, Game.time * 1000);
  }
}

async function endMemorize() {
  if (Game.state !== 'memorize') return;
  Game.state = 'shuffling';
  clearTimeout(Game.timerTimeout);
  setBGMQuiet(false);
  $('#btn-memorized').classList.add('hidden');
  $('#timer-wrap').classList.add('hidden');
  $('#game-message').textContent = 'カードを もとに もどしてね';

  // 裏返す
  SFX.flip();
  Game.cardEls.forEach(el => el.classList.add('facedown'));
  await sleep(550);
  if (Game.state !== 'shuffling') return;

  // シャッフルしてトレイへ移動
  const order = shuffle(Game.cardEls.map((_, i) => i));
  order.forEach((cardId, trayIdx) => {
    Game.cardLoc[cardId] = { loc: 'tray', idx: trayIdx };
    placeCardAt(Game.cardEls[cardId], Game.trayRects[trayIdx]);
  });
  await sleep(400);
  if (Game.state !== 'shuffling') return;

  // 表に返す
  SFX.flip();
  Game.cardEls.forEach(el => el.classList.remove('facedown'));
  await sleep(500);
  if (Game.state !== 'shuffling') return;

  Game.state = 'place';
  speak('カードを もとに もどしてね');
}

/* ---------- ドラッグ ---------- */
function attachDrag(el) {
  let startX = 0, startY = 0, origL = 0, origT = 0, dragging = false;

  el.addEventListener('pointerdown', (e) => {
    if (Game.state !== 'place') return;
    dragging = true;
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    startX = e.clientX; startY = e.clientY;
    origL = parseFloat(el.style.left); origT = parseFloat(el.style.top);
    SFX.pick();
    e.preventDefault();
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    el.style.left = origL + (e.clientX - startX) + 'px';
    el.style.top = origT + (e.clientY - startY) + 'px';
  });

  const finish = (e) => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('dragging');
    dropCard(el);
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);
}

function cellOccupant(cellIdx) {
  for (let id = 0; id < Game.cardLoc.length; id++) {
    const p = Game.cardLoc[id];
    if (p.loc === 'cell' && p.idx === cellIdx) return id;
  }
  return -1;
}
function freeTraySlot() {
  const used = new Set(Game.cardLoc.filter(p => p.loc === 'tray').map(p => p.idx));
  for (let i = 0; i < Game.trayRects.length; i++) if (!used.has(i)) return i;
  return 0;
}

function dropCard(el) {
  const id = Number(el.dataset.id);
  const s = parseFloat(el.style.width);
  const cx = parseFloat(el.style.left) + s / 2;
  const cy = parseFloat(el.style.top) + s / 2;

  // 一番近いセルを探す
  let best = -1, bestDist = Infinity;
  Game.cellRects.forEach((rc, i) => {
    const d = Math.hypot(rc.x + rc.s / 2 - cx, rc.y + rc.s / 2 - cy);
    if (d < bestDist) { bestDist = d; best = i; }
  });

  if (best >= 0 && bestDist < Game.csGrid * 0.7) {
    // セルにスナップ。先客がいたらトレイへ戻す
    const occ = cellOccupant(best);
    if (occ >= 0 && occ !== id) {
      const slot = freeTraySlot();
      Game.cardLoc[occ] = { loc: 'tray', idx: slot };
      placeCardAt(Game.cardEls[occ], Game.trayRects[slot]);
      SFX.back();
    }
    Game.cardLoc[id] = { loc: 'cell', idx: best };
    placeCardAt(el, Game.cellRects[best]);
    SFX.snap();
  } else {
    // トレイへ戻す
    const slot = freeTraySlot();
    Game.cardLoc[id] = { loc: 'tray', idx: slot };
    placeCardAt(el, Game.trayRects[slot]);
    SFX.back();
  }

  // 全セルが埋まったら「できた!」を表示
  const filled = Game.cardLoc.filter(p => p.loc === 'cell').length;
  $('#btn-done').classList.toggle('hidden', filled !== Game.cellRects.length);
}

/* ---------- 答え合わせ ---------- */
async function checkAnswers() {
  if (Game.state !== 'place') return;
  Game.state = 'check';
  $('#btn-done').classList.add('hidden');
  $('#game-message').textContent = 'こたえあわせ!';

  let correctCount = 0;
  const n = Game.cellRects.length;

  for (let cell = 0; cell < n; cell++) {
    if (Game.state !== 'check') return; // 中断された
    const id = cellOccupant(cell);
    const el = Game.cardEls[id];
    const rc = Game.cellRects[cell];
    const isCorrect = (id === cell);
    if (isCorrect) {
      correctCount++;
      el.classList.add('correct');
      const mark = document.createElement('div');
      mark.className = 'cell-mark';
      mark.textContent = '⭐';
      mark.style.left = (rc.x + rc.s - 20) + 'px';
      mark.style.top = (rc.y - 10) + 'px';
      $('#card-layer').appendChild(mark);
      SFX.correct();
    } else {
      el.classList.add('wrong');
      // 正しい絵柄をそっと見せる
      const ghost = document.createElement('div');
      ghost.className = 'cell-ghost';
      const gs = Math.round(rc.s * 0.44);
      ghost.innerHTML = faceHTML(Game.items[cell], gs);
      Object.assign(ghost.style, {
        left: (rc.x + rc.s - gs + 6) + 'px', top: (rc.y + rc.s - gs + 6) + 'px',
        width: gs + 'px', height: gs + 'px',
      });
      $('#card-layer').appendChild(ghost);
      SFX.wrongSoft();
    }
    await sleep(480);
  }

  Game.state = 'result';
  const perfect = correctCount === n;
  const ratio = correctCount / n;
  const stars = perfect ? 3 : ratio >= 0.6 ? 2 : 1;

  // おまかせモードの難易度調整
  if (settings.auto) {
    if (perfect) {
      progress.winStreak++; progress.loseStreak = 0;
      if (progress.winStreak >= 3) {
        progress.level = Math.min(LEVELS.length - 1, progress.level + 1);
        progress.winStreak = 0;
      }
    } else if (ratio < 0.5) {
      progress.loseStreak++; progress.winStreak = 0;
      if (progress.loseStreak >= 2) {
        progress.level = Math.max(0, progress.level - 1);
        progress.loseStreak = 0;
      }
    } else {
      progress.winStreak = 0; progress.loseStreak = 0;
    }
  }

  progress.stars += stars;
  saveProgress();
  addGameRecord('photo', correctCount, n, `${Game.cols}×${Game.rows}`);
  flushPlayTime();

  await sleep(500);
  if (perfect) { SFX.fanfare(); spawnConfetti(); speak('すごい!ぜんぶ せいかい!'); }
  else if (ratio >= 0.6) { speak('よくできました!'); }
  else { speak('おしい!つぎも がんばろうね'); }

  showResult(stars, `${n}まいちゅう ${correctCount}まい せいかい!`, startGame);
}

/* =========================================================
   じゅんばん記憶 ゲーム
   ========================================================= */
const Seq = {
  state: 'idle', items: [], cardSize: 110,
  answer: [],          // スロットに置かれたカードid(順)
  slotEls: [], choiceEls: [],
  startedAt: null,
};

async function startSequence() {
  if (isTimeUp()) { showTimeUp(); return; }
  Seq.state = 'present';
  Seq.startedAt = Date.now();
  showScreen('screen-sequence');
  const n = settings.seqLen;
  Seq.items = pickItems(settings.category, n);
  Seq.answer = []; Seq.slotEls = []; Seq.choiceEls = [];
  $('#seq-done').classList.add('hidden');
  $('#seq-message').textContent = 'でてくる じゅんばんを おぼえてね';
  speak('でてくる じゅんばんを おぼえてね');

  // 11枚以上はスロット・カードとも2段に折り返す前提でサイズを決める
  const area = $('#seq-area').getBoundingClientRect();
  const slotRows = n <= 10 ? 1 : 2;
  const perRow = Math.ceil(n / slotRows);
  const cs = Math.floor(Math.min(
    150,
    (area.width - 40 - 14 * perRow) / perRow,
    (area.height - 60) / (slotRows * 2 + 1.5), // スロット+回答カード+中央の提示スペース
  ));
  Seq.cardSize = cs;

  // 回答スロット(置いたカードをタップすると下に戻せる)
  const slots = $('#seq-slots');
  slots.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div');
    d.className = 'seq-slot';
    d.dataset.idx = i;
    d.style.width = cs + 'px'; d.style.height = cs + 'px';
    d.textContent = i + 1;
    d.addEventListener('pointerdown', () => removeSeqAnswer(i));
    Seq.slotEls.push(d);
    slots.appendChild(d);
  }
  const stage = $('#seq-stage');
  const choices = $('#seq-choices');
  stage.innerHTML = ''; choices.innerHTML = '';

  await sleep(700);

  // 1枚ずつ中央に提示
  for (let i = 0; i < n; i++) {
    if (Seq.state !== 'present') return; // 中断された
    stage.innerHTML = '';
    const d = document.createElement('div');
    d.className = 'card pop-in';
    d.style.position = 'relative';
    d.style.width = cs * 1.3 + 'px'; d.style.height = cs * 1.3 + 'px';
    d.innerHTML = `<div class="card-inner"><div class="card-face card-front">${faceHTML(Seq.items[i], cs * 1.3)}</div></div>`;
    stage.appendChild(d);
    SFX.pop();
    await sleep(settings.seqInterval * 1000);
  }
  stage.innerHTML = '';
  await sleep(300);
  if (Seq.state !== 'present') return;

  // シャッフルして下に並べる
  Seq.state = 'answer';
  $('#seq-message').textContent = 'でてきた じゅんばんに タップしてね';
  speak('でてきた じゅんばんに タップしてね');
  const order = shuffle(Seq.items.map((_, i) => i));
  for (const id of order) {
    const d = document.createElement('div');
    d.className = 'card pop-in';
    d.style.position = 'relative';
    d.style.width = cs + 'px'; d.style.height = cs + 'px';
    d.dataset.id = id;
    d.innerHTML = `<div class="card-inner"><div class="card-face card-front">${faceHTML(Seq.items[id], cs)}</div></div>`;
    d.addEventListener('pointerdown', () => tapSequenceCard(d, id));
    Seq.choiceEls[id] = d;
    choices.appendChild(d);
  }
}

/* 下のカードをタップ → つぎの空きスロットに置く(正誤はまだ判定しない) */
function tapSequenceCard(el, id) {
  if (Seq.state !== 'answer' || Seq.answer.includes(id)) return;
  if (Seq.answer.length >= Seq.items.length) return;
  Seq.answer.push(id);
  el.style.visibility = 'hidden';
  SFX.snap();
  renderSeqSlots();
}

/* スロットのカードをタップ → 下に戻す(あとのカードは前につめる) */
function removeSeqAnswer(slotIdx) {
  if (Seq.state !== 'answer' || slotIdx >= Seq.answer.length) return;
  const [id] = Seq.answer.splice(slotIdx, 1);
  Seq.choiceEls[id].style.visibility = 'visible';
  SFX.back();
  renderSeqSlots();
}

function renderSeqSlots() {
  const n = Seq.items.length;
  Seq.slotEls.forEach((slot, i) => {
    if (i < Seq.answer.length) {
      slot.classList.add('filled');
      slot.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">${faceHTML(Seq.items[Seq.answer[i]], Seq.cardSize)}</div>`;
    } else {
      slot.classList.remove('filled');
      slot.textContent = i + 1;
    }
  });
  $('#seq-done').classList.toggle('hidden', Seq.answer.length !== n);
}

/* 答え合わせ */
async function checkSequence() {
  if (Seq.state !== 'answer' || Seq.answer.length !== Seq.items.length) return;
  Seq.state = 'check';
  $('#seq-done').classList.add('hidden');
  $('#seq-message').textContent = 'こたえあわせ!';

  const n = Seq.items.length;
  let correct = 0;
  for (let i = 0; i < n; i++) {
    if (Seq.state !== 'check') return; // 中断された
    const slot = Seq.slotEls[i];
    if (Seq.answer[i] === i) {
      correct++;
      slot.classList.add('correct');
      SFX.correct();
    } else {
      slot.classList.add('wrong');
      // 正しいカードをそっと見せる
      const gs = Math.round(Seq.cardSize * 0.45);
      const ghost = document.createElement('div');
      ghost.className = 'slot-ghost';
      ghost.style.width = gs + 'px'; ghost.style.height = gs + 'px';
      ghost.innerHTML = faceHTML(Seq.items[i], gs);
      slot.appendChild(ghost);
      SFX.wrongSoft();
    }
    await sleep(450);
  }

  Seq.state = 'result';
  const perfect = correct === n;
  const stars = perfect ? 3 : correct / n >= 0.6 ? 2 : 1;
  progress.stars += stars;
  saveProgress();
  addGameRecord('seq', correct, n, `${n}まい`);
  flushPlayTime();

  await sleep(400);
  if (perfect) { SFX.fanfare(); spawnConfetti(); speak('すごい!ぜんぶ せいかい!'); }
  else if (correct / n >= 0.6) { speak('よくできました!'); }
  else { speak('おしい!つぎも がんばろうね'); }
  showResult(stars, `${n}まいちゅう ${correct}まい せいかい!`, startSequence);
}

/* =========================================================
   結果表示・紙吹雪
   ========================================================= */
let retryCallback = null;

function showResult(stars, message, onRetry) {
  retryCallback = onRetry;
  const starsEl = $('#result-stars');
  starsEl.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const s = document.createElement('span');
    s.className = 'star';
    s.style.animationDelay = (0.15 + i * 0.25) + 's';
    s.textContent = i < stars ? '⭐' : '☆';
    starsEl.appendChild(s);
  }
  $('#result-message').textContent = message;
  $('#result-overlay').classList.remove('hidden');
}

function spawnConfetti() {
  const layer = $('#confetti-layer');
  const colors = ['#E63946', '#F4B41A', '#52B69A', '#457B9D', '#FFB703', '#E76F51'];
  for (let i = 0; i < 70; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.animationDuration = (1.8 + Math.random() * 1.6) + 's';
    c.style.animationDelay = Math.random() * 0.6 + 's';
    c.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    layer.appendChild(c);
    setTimeout(() => c.remove(), 4200);
  }
}

/* =========================================================
   ごほうび図鑑
   ========================================================= */
function renderZukan() {
  const unlocked = Math.floor(progress.stars / ZUKAN_COST);
  $('#zukan-star-count').textContent = progress.stars;
  const remain = ZUKAN_COST - (progress.stars % ZUKAN_COST);
  $('#zukan-next').textContent = unlocked >= ZUKAN.length ? 'コンプリート!🎉' : `つぎまで あと⭐${remain}`;
  const grid = $('#zukan-grid');
  grid.innerHTML = '';
  ZUKAN.forEach(([emoji, name], i) => {
    const d = document.createElement('div');
    const isOpen = i < unlocked;
    d.className = 'zukan-item' + (isOpen ? '' : ' locked');
    d.innerHTML = `<div class="z-icon">${isOpen ? emoji : '❓'}</div><div class="z-name">${isOpen ? name : '???'}</div>`;
    grid.appendChild(d);
  });
}

/* =========================================================
   設定画面・ペアレンタルゲート
   ========================================================= */
const SETTING_OPTS = {
  grid:     { values: ['2x2','2x3','3x3','3x4','4x4','5x4'], labels: ['2×2','2×3','3×3','3×4','4×4','5×4'] },
  timeLimit: { values: [0,10,20,30], labels: ['なし','10ぷん','20ぷん','30ぷん'] },
  time:     { values: [3,5,10,15,30,0], labels: ['3びょう','5びょう','10びょう','15びょう','30びょう','むげん'] },
  category: { values: Object.keys(CATEGORIES), labels: Object.values(CATEGORIES).map(c => c.label) },
  reveal:   { values: ['seq','all'], labels: ['1まいずつ','いっせい'] },
  seqLen:   { values: [3,4,5,6,8,10,15,20], labels: ['3まい','4まい','5まい','6まい','8まい','10まい','15まい','20まい'] },
  seqInterval: { values: [1,2,3], labels: ['1びょう','2びょう','3びょう'] },
  auto:     { values: [true,false], labels: ['オン','オフ'] },
  sound:    { values: [true,false], labels: ['オン','オフ'] },
  bgm:      { values: [true,false], labels: ['オン','オフ'] },
  voice:    { values: [true,false], labels: ['オン','オフ'] },
};

function renderSettings() {
  document.querySelectorAll('.setting-options').forEach(box => {
    const key = box.dataset.setting;
    const opt = SETTING_OPTS[key];
    box.innerHTML = '';
    opt.values.forEach((v, i) => {
      const b = document.createElement('button');
      b.className = 'opt-pill' + (settings[key] === v ? ' selected' : '');
      b.textContent = opt.labels[i];
      b.addEventListener('click', () => {
        settings[key] = v;
        // わくのかず・じかんを手動で選んだら、おまかせモードは自動でオフにする
        if (key === 'grid' || key === 'time') settings.auto = false;
        saveSettings();
        if (key === 'bgm') { v ? (ensureAudio(), startBGM()) : stopBGM(); }
        renderSettings();
      });
      box.appendChild(b);
    });
  });
}

/* =========================================================
   プロフィール(兄弟利用)
   ========================================================= */
let newAvatar = AVATARS[0];

function renderProfileChip() {
  const p = activeProfile();
  $('#profile-chip').textContent = `${p.avatar} ${p.name}`;
}

function switchProfile(id) {
  profiles.activeId = id;
  saveProfiles();
  loadProfileData();
  renderProfileChip();
  $('#home-star-count').textContent = progress.stars;
}

function renderProfileList() {
  const box = $('#profile-list');
  box.innerHTML = '';
  profiles.list.forEach(p => {
    const b = document.createElement('button');
    b.className = 'profile-item' + (p.id === profiles.activeId ? ' active' : '');
    b.innerHTML = `<span class="p-avatar">${p.avatar}</span><span class="p-name">${p.name}</span>`;
    b.addEventListener('click', () => {
      switchProfile(p.id);
      $('#profile-modal').classList.add('hidden');
    });
    if (profiles.list.length > 1) {
      const del = document.createElement('span');
      del.className = 'p-del';
      del.textContent = '✕';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        openGate(() => {
          if (confirm(`「${p.name}」のデータをぜんぶけします。よろしいですか?`)) deleteProfile(p.id);
        });
      });
      b.appendChild(del);
    }
    box.appendChild(b);
  });
  $('#profile-add').classList.toggle('hidden', profiles.list.length >= 4);
}

function deleteProfile(id) {
  ['pr_settings_', 'pr_progress_', 'pr_records_'].forEach(k => localStorage.removeItem(k + id));
  profiles.list = profiles.list.filter(p => p.id !== id);
  if (profiles.activeId === id) profiles.activeId = profiles.list[0].id;
  saveProfiles();
  loadProfileData();
  renderProfileChip();
  $('#home-star-count').textContent = progress.stars;
  renderProfileList();
}

function renderAvatarPick() {
  const box = $('#avatar-pick');
  box.innerHTML = '';
  AVATARS.forEach(a => {
    const b = document.createElement('button');
    b.textContent = a;
    b.className = a === newAvatar ? 'selected' : '';
    b.addEventListener('click', () => { newAvatar = a; renderAvatarPick(); });
    box.appendChild(b);
  });
}

function createProfile() {
  const name = $('#profile-name').value.trim() || `プレイヤー${profiles.list.length + 1}`;
  const p = { id: 'p' + Date.now(), name, avatar: newAvatar };
  profiles.list.push(p);
  saveProfiles();
  switchProfile(p.id);
  $('#profile-modal').classList.add('hidden');
  speak(`${name}、よろしくね!`);
}

/* =========================================================
   きろく(親向け・プロフィールごと)
   ========================================================= */
function renderRecords() {
  const p = activeProfile();
  $('#records-title-name').textContent = `${p.avatar} ${p.name}`;

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    const games = records.games.filter(g => g.d === key);
    days.push({
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      plays: games.length,
      acc: games.length ? Math.round(games.reduce((s, g) => s + g.correct / g.total, 0) / games.length * 100) : null,
      mins: Math.round((records.daily[key] || 0) / 60),
    });
  }
  const maxPlays = Math.max(1, ...days.map(d => d.plays));
  const totalGames = records.games.length;
  const photoGames = records.games.filter(g => g.mode === 'photo').length;

  $('#records-body').innerHTML = `
    <div class="records-summary">
      ⭐ ${progress.stars} / ぜんぶで ${totalGames}かい(しゅんかんきおく ${photoGames}かい・おはなしきおく ${totalGames - photoGames}かい)
    </div>
    <div class="records-chart">
      ${days.map(d => `
        <div class="rec-row">
          <span class="rec-date">${d.label}</span>
          <div class="rec-bar-track"><div class="rec-bar" style="width:${d.plays / maxPlays * 100}%"></div></div>
          <span class="rec-info">${d.plays ? `${d.plays}かい / せいかいりつ${d.acc}% / ${d.mins}ふん` : '−'}</span>
        </div>`).join('')}
    </div>`;
}

/* ペアレンタルゲート */
let gateCode = [], gateProgress = 0, gateSuccess = null;

function openGate(onSuccess) {
  gateSuccess = onSuccess;
  gateCode = shuffle([1,2,3,4,5,6,7,8,9]).slice(0, 3);
  gateProgress = 0;
  $('#gate-code').textContent = gateCode.join(' → ');
  const pad = $('#gate-pad');
  pad.innerHTML = '';
  for (let i = 1; i <= 9; i++) {
    const b = document.createElement('button');
    b.textContent = i;
    b.addEventListener('click', () => {
      if (i === gateCode[gateProgress]) {
        gateProgress++;
        if (gateProgress >= 3) {
          $('#gate-modal').classList.add('hidden');
          gateSuccess?.();
        }
      } else {
        gateProgress = 0;
      }
    });
    pad.appendChild(b);
  }
  $('#gate-modal').classList.remove('hidden');
}

/* =========================================================
   イベント配線・初期化
   ========================================================= */
function goHome() {
  flushPlayTime();
  Game.state = 'idle';
  Seq.state = 'idle';
  clearTimeout(Game.timerTimeout);
  $('#result-overlay').classList.add('hidden');
  $('#seq-done').classList.add('hidden');
  showScreen('screen-home');
}

function init() {
  // 最初のタッチでオーディオを有効化(iOS Safariの自動再生制限対応)
  document.addEventListener('pointerdown', () => {
    ensureAudio();
    if (settings.bgm) startBGM();
  }, { once: true });

  $('#btn-play').addEventListener('click', startGame);
  $('#btn-sequence').addEventListener('click', startSequence);
  $('#btn-zukan').addEventListener('click', () => { renderZukan(); showScreen('screen-zukan'); });
  $('#btn-settings').addEventListener('click', () => {
    renderSettings();
    showScreen('screen-settings');
  });
  $('#gate-cancel').addEventListener('click', () => $('#gate-modal').classList.add('hidden'));

  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', goHome));

  $('#btn-memorized').addEventListener('click', endMemorize);
  $('#btn-done').addEventListener('click', checkAnswers);
  $('#seq-done').addEventListener('click', checkSequence);

  // プロフィール
  $('#profile-chip').addEventListener('click', () => {
    renderProfileList();
    $('#profile-new').classList.add('hidden');
    $('#profile-modal').classList.remove('hidden');
  });
  $('#profile-close').addEventListener('click', () => $('#profile-modal').classList.add('hidden'));
  $('#profile-add').addEventListener('click', () => {
    $('#profile-name').value = '';
    newAvatar = AVATARS[0];
    renderAvatarPick();
    $('#profile-new').classList.remove('hidden');
  });
  $('#profile-create').addEventListener('click', createProfile);

  // きろく・時間制限
  $('#btn-records').addEventListener('click', () => { renderRecords(); showScreen('screen-records'); });
  $('#timeup-home').addEventListener('click', () => {
    $('#timeup-overlay').classList.add('hidden');
    goHome();
  });

  $('#game-home-btn').addEventListener('click', goHome);
  $('#seq-home-btn').addEventListener('click', goHome);

  $('#btn-retry').addEventListener('click', () => {
    $('#result-overlay').classList.add('hidden');
    retryCallback?.();
  });
  $('#btn-go-home').addEventListener('click', goHome);

  // リセットだけは誤操作防止のためペアレンタルゲートを通す(いまのプロフィールのみ)
  $('#btn-reset-data').addEventListener('click', () => {
    openGate(() => {
      if (confirm(`「${activeProfile().name}」のスター・きろく・せっていをリセットします。よろしいですか?`)) {
        ['pr_settings_', 'pr_progress_', 'pr_records_'].forEach(k => localStorage.removeItem(k + profiles.activeId));
        loadProfileData();
        renderSettings();
        goHome();
      }
    });
  });

  // リサイズ時はゲーム中ならレイアウトを組み直す
  window.addEventListener('resize', () => {
    if ($('#screen-game').classList.contains('active') && Game.cardEls.length) {
      computeLayout();
      renderBoards();
      Game.cardEls.forEach(el => {
        const p = Game.cardLoc[Number(el.dataset.id)];
        const rc = p.loc === 'cell' ? Game.cellRects[p.idx] : Game.trayRects[p.idx];
        placeCardAt(el, rc, false);
      });
    }
  });

  $('#home-star-count').textContent = progress.stars;
  renderProfileChip();

  // Service Worker(オフライン対応)
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
