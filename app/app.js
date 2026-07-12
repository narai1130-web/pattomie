'use strict';

/* =========================================================
   ぱっとみえ! — フォトリーディング・トレーニングゲーム
   ========================================================= */

/* ---------- カードデータ ---------- */
const SHAPE_COLORS = [
  ['あか', '#E63946'], ['あお', '#457B9D'], ['きいろ', '#F4B41A'], ['みどり', '#52B69A'],
];
const SHAPE_KINDS = [
  ['まる', 'circle'], ['さんかく', 'triangle'], ['しかく', 'square'], ['ほし', 'star'],
];
const SHAPE_ITEMS = [];
for (const [cname, color] of SHAPE_COLORS) {
  for (const [sname, shape] of SHAPE_KINDS) {
    SHAPE_ITEMS.push({ shape, color, name: cname + sname });
  }
}

const CATEGORIES = {
  animals:  { label: 'どうぶつ', items: ['🐶','🐱','🐭','🐰','🦊','🐻','🐼','🐸','🐷','🐮','🦁','🐘','🦒','🐟','🐦','🐢'] },
  foods:    { label: 'たべもの', items: ['🍎','🍌','🍇','🍓','🍉','🍊','🥕','🌽','🍞','🍙','🍜','🍕','🍰','🍩','🍦','🍪'] },
  vehicles: { label: 'のりもの', items: ['🚗','🚌','🚒','🚑','🚓','🚜','🚲','🛴','🚂','✈️','🚁','🚀','⛵','🚢','🛵','🚚'] },
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
];

/* ---------- 保存 ---------- */
const DEFAULT_SETTINGS = {
  grid: '2x3', time: 10, category: 'animals', reveal: 'seq',
  seqLen: 3, auto: true, sound: true, bgm: true, voice: true,
};
const DEFAULT_PROGRESS = { stars: 0, level: 0, winStreak: 0, loseStreak: 0 };

let settings = load('pr_settings', DEFAULT_SETTINGS);
let progress = load('pr_progress', DEFAULT_PROGRESS);

function load(key, def) {
  try { return { ...def, ...JSON.parse(localStorage.getItem(key) || '{}') }; }
  catch { return { ...def }; }
}
function saveSettings() { localStorage.setItem('pr_settings', JSON.stringify(settings)); }
function saveProgress() { localStorage.setItem('pr_progress', JSON.stringify(progress)); }

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
  cardSize: 0,
  timerTimeout: null,
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

  // トレイの列数
  const trayCols = n <= 6 ? 2 : 3;
  const trayRows = Math.ceil(n / trayCols);

  const gridRegionW = W * 0.58 - pad * 2;
  const trayRegionW = W * 0.38 - pad * 2;
  const regionH = H - pad * 2;

  const csGrid = Math.min(
    (gridRegionW - gap * (Game.cols - 1)) / Game.cols,
    (regionH - gap * (Game.rows - 1)) / Game.rows,
  );
  const csTray = Math.min(
    (trayRegionW - gap * (trayCols - 1)) / trayCols,
    (regionH - gap * (trayRows - 1)) / trayRows,
  );
  const cs = Math.floor(Math.min(csGrid, csTray, 170));
  Game.cardSize = cs;

  // グリッドセル座標(グリッド領域の中央に配置)
  const gridW = Game.cols * cs + (Game.cols - 1) * gap;
  const gridH = Game.rows * cs + (Game.rows - 1) * gap;
  const gx0 = pad + (gridRegionW - gridW) / 2;
  const gy0 = (H - gridH) / 2;
  Game.cellRects = [];
  for (let r = 0; r < Game.rows; r++) {
    for (let c = 0; c < Game.cols; c++) {
      Game.cellRects.push({ x: gx0 + c * (cs + gap), y: gy0 + r * (cs + gap), s: cs });
    }
  }

  // トレイスロット座標(右側領域の中央)
  const trayW = trayCols * cs + (trayCols - 1) * gap;
  const trayH = trayRows * cs + (trayRows - 1) * gap;
  const tx0 = W * 0.60 + (trayRegionW - trayW) / 2;
  const ty0 = (H - trayH) / 2;
  Game.trayRects = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / trayCols), c = i % trayCols;
    Game.trayRects.push({ x: tx0 + c * (cs + gap), y: ty0 + r * (cs + gap), s: cs });
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
  el.style.width = Game.cardSize + 'px';
  el.style.height = Game.cardSize + 'px';
  el.innerHTML = `
    <div class="card-inner">
      <div class="card-face card-front">${faceHTML(item, Game.cardSize)}</div>
      <div class="card-face card-back"></div>
    </div>`;
  attachDrag(el);
  return el;
}

function placeCardAt(el, rect, animate = true) {
  if (!animate) el.classList.add('no-anim');
  el.style.left = rect.x + 'px';
  el.style.top = rect.y + 'px';
  if (!animate) {
    void el.offsetWidth; // reflow
    el.classList.remove('no-anim');
  }
}

async function startGame() {
  const d = currentDifficulty();
  Game.cols = d.cols; Game.rows = d.rows; Game.time = d.time;
  Game.state = 'present';
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
  const cs = Game.cardSize;
  const cx = parseFloat(el.style.left) + cs / 2;
  const cy = parseFloat(el.style.top) + cs / 2;

  // 一番近いセルを探す
  let best = -1, bestDist = Infinity;
  Game.cellRects.forEach((rc, i) => {
    const d = Math.hypot(rc.x + cs / 2 - cx, rc.y + cs / 2 - cy);
    if (d < bestDist) { bestDist = d; best = i; }
  });

  if (best >= 0 && bestDist < cs * 0.7) {
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
  state: 'idle', items: [], order: [], expect: 0, mistakes: 0, cardSize: 110,
};

async function startSequence() {
  Seq.state = 'present';
  showScreen('screen-sequence');
  const n = settings.seqLen;
  Seq.items = pickItems(settings.category, n);
  Seq.expect = 0; Seq.mistakes = 0;
  $('#seq-message').textContent = 'でてくる じゅんばんを おぼえてね';
  speak('でてくる じゅんばんを おぼえてね');

  const area = $('#seq-area').getBoundingClientRect();
  const cs = Math.floor(Math.min(150, (area.width - 40 - 14 * n) / n, area.height * 0.3));
  Seq.cardSize = cs;

  // 回答スロット
  const slots = $('#seq-slots');
  slots.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div');
    d.className = 'seq-slot';
    d.dataset.idx = i;
    d.style.width = cs + 'px'; d.style.height = cs + 'px';
    d.textContent = i + 1;
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
    await sleep(1000);
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
    choices.appendChild(d);
  }
}

async function tapSequenceCard(el, id) {
  if (Seq.state !== 'answer' || el.classList.contains('placed')) return;
  if (id === Seq.expect) {
    el.classList.add('placed', 'correct');
    SFX.correct();
    // スロットへ飛ばす(スロットに複製を置き、元を消す)
    const slot = document.querySelector(`.seq-slot[data-idx="${Seq.expect}"]`);
    slot.textContent = '';
    const inner = document.createElement('div');
    inner.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;';
    inner.innerHTML = faceHTML(Seq.items[id], Seq.cardSize);
    slot.appendChild(inner);
    slot.classList.add('pop-in');
    el.style.visibility = 'hidden';
    Seq.expect++;
    if (Seq.expect >= Seq.items.length) {
      Seq.state = 'result';
      const stars = Seq.mistakes === 0 ? 3 : Seq.mistakes <= 2 ? 2 : 1;
      progress.stars += stars;
      saveProgress();
      await sleep(400);
      if (Seq.mistakes === 0) { SFX.fanfare(); spawnConfetti(); speak('すごい!ぜんぶ せいかい!'); }
      else speak('よくできました!');
      showResult(stars, 'ぜんぶ ならべられたね!', startSequence);
    }
  } else {
    Seq.mistakes++;
    el.classList.remove('wrong');
    void el.offsetWidth;
    el.classList.add('wrong');
    SFX.wrongSoft();
  }
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
  grid:     { values: ['2x2','2x3','3x3','3x4','4x4'], labels: ['2×2','2×3','3×3','3×4','4×4'] },
  time:     { values: [3,5,10,15,30,0], labels: ['3びょう','5びょう','10びょう','15びょう','30びょう','むげん'] },
  category: { values: Object.keys(CATEGORIES), labels: Object.values(CATEGORIES).map(c => c.label) },
  reveal:   { values: ['seq','all'], labels: ['1まいずつ','いっせい'] },
  seqLen:   { values: [3,4,5,6], labels: ['3まい','4まい','5まい','6まい'] },
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
      if (settings.auto && (key === 'grid' || key === 'time')) b.disabled = true;
      b.addEventListener('click', () => {
        settings[key] = v;
        saveSettings();
        if (key === 'bgm') { v ? (ensureAudio(), startBGM()) : stopBGM(); }
        renderSettings();
      });
      box.appendChild(b);
    });
  });
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
  Game.state = 'idle';
  Seq.state = 'idle';
  clearTimeout(Game.timerTimeout);
  $('#result-overlay').classList.add('hidden');
  showScreen('screen-home');
}

function setupHoldHome(btn) {
  let t = null;
  btn.addEventListener('pointerdown', () => {
    btn.classList.add('holding');
    t = setTimeout(() => { btn.classList.remove('holding'); goHome(); }, 650);
  });
  const cancel = () => { btn.classList.remove('holding'); clearTimeout(t); };
  btn.addEventListener('pointerup', cancel);
  btn.addEventListener('pointerleave', cancel);
  btn.addEventListener('pointercancel', cancel);
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
    openGate(() => { renderSettings(); showScreen('screen-settings'); });
  });
  $('#gate-cancel').addEventListener('click', () => $('#gate-modal').classList.add('hidden'));

  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', goHome));

  $('#btn-memorized').addEventListener('click', endMemorize);
  $('#btn-done').addEventListener('click', checkAnswers);

  setupHoldHome($('#game-home-btn'));
  setupHoldHome($('#seq-home-btn'));

  $('#btn-retry').addEventListener('click', () => {
    $('#result-overlay').classList.add('hidden');
    retryCallback?.();
  });
  $('#btn-go-home').addEventListener('click', goHome);

  $('#btn-reset-data').addEventListener('click', () => {
    if (confirm('スターとせっていをぜんぶリセットします。よろしいですか?')) {
      localStorage.removeItem('pr_settings');
      localStorage.removeItem('pr_progress');
      settings = { ...DEFAULT_SETTINGS };
      progress = { ...DEFAULT_PROGRESS };
      renderSettings();
      goHome();
    }
  });

  // リサイズ時はゲーム中ならレイアウトを組み直す
  window.addEventListener('resize', () => {
    if ($('#screen-game').classList.contains('active') && Game.cardEls.length) {
      computeLayout();
      renderBoards();
      Game.cardEls.forEach(el => {
        el.style.width = Game.cardSize + 'px';
        el.style.height = Game.cardSize + 'px';
        const p = Game.cardLoc[Number(el.dataset.id)];
        const rc = p.loc === 'cell' ? Game.cellRects[p.idx] : Game.trayRects[p.idx];
        placeCardAt(el, rc, false);
      });
    }
  });

  $('#home-star-count').textContent = progress.stars;

  // Service Worker(オフライン対応)
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
