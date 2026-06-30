// TODO: Once published to npm, replace with: import { ChatClient } from 'https://unpkg.com/@azure/web-pubsub-chat-client/dist/browser/index.js'
import { ChatClient } from '/@azure/web-pubsub-chat-client/index.js';

// Constants
const GRID = 8;
const SHIPS = [4, 3, 3, 2]; // 12 cells total
const TOTAL_CELLS = SHIPS.reduce((a, b) => a + b, 0);

// State
let client = null;
let games = new Map();      // roomId → game
let currentGameId = null;

// DOM
const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString();
}

function cellLabel(r, c) {
  return `${String.fromCharCode(65 + r)}${c + 1}`;
}

function showError(msg) {
  $('login-error').textContent = msg;
  $('login-error').classList.remove('hidden');
}

function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

// Ship Placement (random)
function placeShips() {
  const used = new Set();
  const cells = [];
  for (const size of SHIPS) {
    while (true) {
      const h = Math.random() > 0.5;
      const r = Math.floor(Math.random() * GRID);
      const c = Math.floor(Math.random() * GRID);
      if (h && c + size > GRID) continue;
      if (!h && r + size > GRID) continue;
      const batch = [];
      let ok = true;
      for (let i = 0; i < size; i++) {
        const key = h ? `${r},${c + i}` : `${r + i},${c}`;
        if (used.has(key)) { ok = false; break; }
        batch.push(key);
      }
      if (ok) {
        batch.forEach(k => used.add(k));
        cells.push(...batch);
        break;
      }
    }
  }
  return cells;
}

// Game State
function newGame(roomId, title) {
  return {
    roomId, title,
    myShips: null,           // Set<"r,c"> — my ship cells
    setups: new Map(),       // userId → Set<"r,c">
    attacks: [],             // [{attacker, target, row, col, result, time}]
    eliminated: new Set(),   // announced eliminations
    lastActivity: Date.now(),// timestamp for sorting
  };
}

function hitsOn(g, uid) {
  return new Set(g.attacks.filter(a => a.target === uid && a.result === 'hit').map(a => `${a.row},${a.col}`));
}

function remaining(g, uid) {
  const s = g.setups.get(uid);
  if (!s) return 0;
  return s.size - hitsOn(g, uid).size;
}

function isAlive(g, uid) {
  const s = g.setups.get(uid);
  return s ? remaining(g, uid) > 0 : true;
}

function alivePlayers(g) {
  return [...g.setups.keys()].filter(u => isAlive(g, u));
}

function getWinner(g) {
  if (g.setups.size < 2) return null;
  const ap = alivePlayers(g);
  return ap.length === 1 ? ap[0] : null;
}

// Login
document.querySelectorAll('.name-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $('input-username').value = btn.dataset.name;
    doLogin();
  });
});
$('btn-login').addEventListener('click', doLogin);
$('input-username').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

async function doLogin() {
  const username = $('input-username').value.trim();
  if (!username) return showError('Enter a username');

  const btn = $('btn-login');
  btn.textContent = 'Logging in...';
  btn.classList.add('opacity-70');
  $('input-username').disabled = true;
  document.querySelectorAll('.name-btn').forEach(b => b.classList.add('opacity-50', 'pointer-events-none'));

  try {
    const resp = await fetch(`/negotiate?userId=${encodeURIComponent(username)}`);
    const { url } = await resp.json();

    client = await ChatClient.start(url);

    btn.textContent = 'Logged in';
    $('display-username').textContent = `✓ Logged in as ${client.userId}`;
    $('login-bar').classList.add('opacity-50', 'pointer-events-none');
    $('main-content').classList.remove('hidden');

    // Remove self from invite list
    const inp = $('input-players');
    inp.value = inp.value.split(',').map(s => s.trim()).filter(s => s.toLowerCase() !== client.userId.toLowerCase()).join(', ');

    setupListeners();

    // Restore existing games and auto-deploy ships for any game where we haven't yet
    for (const room of client.rooms) {
      await loadGame(room.roomId, room.title);
      const g = games.get(room.roomId);
      if (g && !g.myShips) {
        const ships = placeShips();
        g.myShips = new Set(ships);
        g.setups.set(client.userId, g.myShips);
        await client.sendToRoom(room.roomId, JSON.stringify({ type: 'setup', ships }));
      }
    }
    renderGameList();
  } catch (e) {
    showError('Login failed: ' + e.message);
    btn.textContent = 'Login';
    btn.classList.remove('opacity-70');
    $('input-username').disabled = false;
    document.querySelectorAll('.name-btn').forEach(b => b.classList.remove('opacity-50', 'pointer-events-none'));
  }
}

// SDK Listeners
function setupListeners() {
  client.on("room-joined", async (event) => {
    const room = event.room;
    await loadGame(room.roomId, room.title);

    // Auto-deploy ships immediately so other players can see our board
    const g = games.get(room.roomId);
    if (g && !g.myShips) {
      const ships = placeShips();
      g.myShips = new Set(ships);
      g.setups.set(client.userId, g.myShips);
      await client.sendToRoom(room.roomId, JSON.stringify({ type: 'setup', ships }));
    }

    renderGameList();
    if (games.size === 1) openGame(room.roomId);
  });

  client.on("member-joined", (event) => {
    if (event.roomId === currentGameId) renderPlayersBar();
  });

  client.on("message", (event) => {
    const msg = event.message;
    const roomId = event.roomId;
    if (!roomId || msg.createdBy === client.userId) return;

    const g = games.get(roomId);
    if (!g) return;

    try {
      const d = JSON.parse(msg.content.text);

      if (d.type === 'setup') {
        g.setups.set(msg.createdBy, new Set(d.ships));
        if (roomId === currentGameId) {
          renderPlayersBar();
          renderOpponentBoards();
        }
        return;
      }

      if (d.type === 'attack') {
        g.attacks.push({
          attacker: msg.createdBy, target: d.target,
          row: d.row, col: d.col, result: d.result, time: msg.createdAt,
        });
        g.lastActivity = Date.now();

        if (roomId === currentGameId) {
          if (d.target === client.userId) {
            // Animate incoming attack from attacker's board to my board
            const attackerWrapper = findOpponentBoard(msg.createdBy);
            const myBoardEl = $('my-board');
            const targetCell = findCellInBoard(myBoardEl, d.row, d.col);
            if (attackerWrapper && targetCell) {
              const attackerBoard = attackerWrapper.querySelector('.board');
              animateAttack(attackerBoard, targetCell, d.result).catch(() => {});
            }
            renderMyBoard();
            // Flash my board red when I'm hit
            const myBoard = $('my-board');
            myBoard.classList.remove('board-hit-flash');
            void myBoard.offsetWidth; // reflow to retrigger
            myBoard.classList.add('board-hit-flash');
            setTimeout(() => myBoard.classList.remove('board-hit-flash'), 600);
          }
          renderOpponentBoards();
          renderPlayersBar();
          prependLog(msg.createdBy, d.target, d.row, d.col, d.result, msg.createdAt);
          checkElimination(g, d.target);
          checkWinner(g);
        }
        renderGameList(roomId);
      }
    } catch { /* ignore non-JSON */ }
  });
}

// Load Game from History
async function loadGame(roomId, title) {
  if (games.has(roomId)) return;
  const g = newGame(roomId, title);

  try {
    const messages = [];
    for await (const msg of client.listRoomMessages(roomId)) {
      messages.push(msg);
    }
    for (const msg of messages) {
      try {
        const d = JSON.parse(msg.content.text);
        if (d.type === 'setup') {
          g.setups.set(msg.createdBy, new Set(d.ships));
          if (msg.createdBy === client.userId) g.myShips = new Set(d.ships);
        }
        if (d.type === 'attack') {
          g.attacks.push({
            attacker: msg.createdBy, target: d.target,
            row: d.row, col: d.col, result: d.result, time: msg.createdAt,
          });
        }
      } catch { /* skip */ }
    }
  } catch { /* room might be empty */ }

  // Track already-eliminated players
  for (const uid of g.setups.keys()) {
    if (!isAlive(g, uid)) g.eliminated.add(uid);
  }

  // Don't overwrite if another path (e.g. create handler) already set up this game
  if (!games.has(roomId)) {
    games.set(roomId, g);
  }
}

// Create Game
$('btn-create').addEventListener('click', async () => {
  const raw = $('input-players').value.trim();
  const players = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];

  const btn = $('btn-create');
  btn.disabled = true;
  btn.textContent = 'Creating...';

  try {
    const room = await client.createRoom('Battle', players);
    games.set(room.roomId, newGame(room.roomId, 'Battle'));
    renderGameList();
    openGame(room.roomId);
  } catch (e) {
    alert('Failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Start Game';
  }
});

// Open Game
async function openGame(roomId) {
  const g = games.get(roomId);
  if (!g) return;

  currentGameId = roomId;
  $('game-title').textContent = `${g.title} [${roomId.slice(0, 4)}]`;

  // Auto-deploy ships on first open
  if (!g.myShips) {
    const ships = placeShips();
    g.myShips = new Set(ships);
    g.setups.set(client.userId, g.myShips);
    await client.sendToRoom(roomId, JSON.stringify({ type: 'setup', ships }));
  }

  renderMyBoard();
  renderPlayersBar();
  renderOpponentBoards();
  renderLog();
  checkWinner(g);

  $('game-panel').classList.remove('hidden');
  renderGameList();
}

// Find a cell element in a board container by row/col
function findCellInBoard(boardEl, row, col) {
  return boardEl.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
}

// Find an opponent's board wrapper by userId
function findOpponentBoard(uid) {
  return $('opponent-boards').querySelector(`[data-uid="${uid}"]`);
}

// Attack Animation
function animateAttack(fromEl, toEl, result) {
  return new Promise(resolve => {
    const fromRect = fromEl.getBoundingClientRect();
    const targetRect = toEl.getBoundingClientRect();

    const sx = fromRect.left + fromRect.width / 2;
    const sy = fromRect.top + fromRect.height / 2;
    const ex = targetRect.left + targetRect.width / 2;
    const ey = targetRect.top + targetRect.height / 2;

    // SVG trail line
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'attack-overlay');
    svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', sx); line.setAttribute('y1', sy);
    line.setAttribute('x2', sx); line.setAttribute('y2', sy);
    line.setAttribute('stroke', result === 'hit' ? '#ef4444' : '#60a5fa');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('opacity', '0.6');
    svg.appendChild(line);
    document.body.appendChild(svg);

    // Projectile
    const proj = document.createElement('div');
    proj.className = 'projectile';
    proj.textContent = '💣';
    proj.style.left = sx + 'px';
    proj.style.top = sy + 'px';
    document.body.appendChild(proj);

    const duration = 400;
    const start = performance.now();

    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      const ease = t * (2 - t); // ease-out
      const cx = sx + (ex - sx) * ease;
      const cy = sy + (ey - sy) * ease;
      proj.style.left = cx + 'px';
      proj.style.top = cy + 'px';
      line.setAttribute('x2', cx);
      line.setAttribute('y2', cy);

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        proj.remove();
        line.setAttribute('opacity', '0');
        line.style.transition = 'opacity 0.3s';
        setTimeout(() => svg.remove(), 300);

        // Impact burst
        const impact = document.createElement('div');
        impact.className = 'impact-effect';
        impact.textContent = result === 'hit' ? '💥' : '🌊';
        impact.style.left = ex + 'px';
        impact.style.top = ey + 'px';
        document.body.appendChild(impact);
        setTimeout(() => { impact.remove(); resolve(); }, 500);
      }
    }
    requestAnimationFrame(step);
  });
}

// Attack
async function handleAttack(targetUserId, row, col, cellEl) {
  const g = games.get(currentGameId);
  if (!g || !targetUserId) return;
  if (!isAlive(g, client.userId) || !isAlive(g, targetUserId)) return;

  const key = `${row},${col}`;
  if (g.attacks.some(a => a.attacker === client.userId && a.target === targetUserId && a.row === row && a.col === col)) return;

  const ships = g.setups.get(targetUserId);
  if (!ships) return;
  const result = ships.has(key) ? 'hit' : 'miss';

  try {
    // Run animation and network send in parallel
    const animP = cellEl ? animateAttack($('my-board'), cellEl, result).catch(() => {}) : Promise.resolve();
    const sendP = client.sendToRoom(currentGameId, JSON.stringify({ type: 'attack', target: targetUserId, row, col, result }));
    await Promise.all([animP, sendP]);

    g.attacks.push({ attacker: client.userId, target: targetUserId, row, col, result, time: new Date().toISOString() });
    g.lastActivity = Date.now();

    renderOpponentBoards();
    renderPlayersBar();
    prependLog(client.userId, targetUserId, row, col, result, new Date().toISOString());
    renderGameList(currentGameId);
    checkElimination(g, targetUserId);
    checkWinner(g);
  } catch (e) {
    alert('Attack failed: ' + e.message);
  }
}

// Elimination & Winner
function checkElimination(g, target) {
  if (!isAlive(g, target) && !g.eliminated.has(target)) {
    g.eliminated.add(target);
    const row = mk('div', 'px-3 py-2 text-sm text-red-600 font-semibold', `💀 ${target} eliminated!`);
    row.classList.add('hit-anim');
    $('battle-log').prepend(row);
    renderOpponentBoards();
  }
}

function checkWinner(g) {
  const w = getWinner(g);
  const banner = $('winner-banner');
  if (w) {
    banner.textContent = w === client.userId ? '🎉 You win!' : `🎉 ${w} wins!`;
    banner.classList.remove('hidden');
    renderOpponentBoards();
  } else {
    banner.classList.add('hidden');
  }
}

// Rendering: Board
function renderBoard(container, cellState, onClick) {
  container.innerHTML = '';

  // Column labels row
  container.appendChild(mk('div', 'lbl lbl-col', ''));
  for (let c = 0; c < GRID; c++) {
    container.appendChild(mk('div', 'lbl lbl-col', String(c + 1)));
  }

  // Grid
  for (let r = 0; r < GRID; r++) {
    container.appendChild(mk('div', 'lbl lbl-row', String.fromCharCode(65 + r)));
    for (let c = 0; c < GRID; c++) {
      const s = cellState(r, c);
      const cell = mk('div', `cell ${s.cls}`, s.txt || '');
      cell.dataset.row = r;
      cell.dataset.col = c;
      if (s.click && onClick) cell.addEventListener('click', () => onClick(r, c, cell));
      container.appendChild(cell);
    }
  }
}

// My Fleet
function renderMyBoard() {
  const g = games.get(currentGameId);
  if (!g || !g.myShips) return;

  const hits = hitsOn(g, client.userId);
  const misses = new Set(
    g.attacks.filter(a => a.target === client.userId && a.result === 'miss').map(a => `${a.row},${a.col}`)
  );

  renderBoard($('my-board'), (r, c) => {
    const k = `${r},${c}`;
    if (g.myShips.has(k) && hits.has(k)) return { cls: 'cell-hit', txt: '💥' };
    if (g.myShips.has(k)) return { cls: 'cell-ship', txt: '🚢' };
    if (misses.has(k)) return { cls: 'cell-miss', txt: '🌊' };
    return { cls: 'cell-water' };
  });
}

// All Opponent Boards
function renderOpponentBoards() {
  const g = games.get(currentGameId);
  const container = $('opponent-boards');
  if (!g) { container.innerHTML = ''; return; }

  const opponents = [...g.setups.keys()].filter(u => u !== client.userId);
  container.innerHTML = '';

  if (opponents.length === 0) {
    container.innerHTML = '<p class="text-gray-400 text-sm py-4">Waiting for opponents to deploy...</p>';
    return;
  }

  for (const uid of opponents) {
    const wrapper = document.createElement('div');
    wrapper.dataset.uid = uid;
    const alive = isAlive(g, uid);
    const rem = remaining(g, uid);

    const label = mk('h3', `text-sm font-medium mb-1 ${alive ? 'text-gray-600' : 'text-red-400 line-through'}`,
      alive ? `${uid} (${rem}/${TOTAL_CELLS})` : `${uid} ☠️`);
    wrapper.appendChild(label);

    const boardEl = document.createElement('div');
    boardEl.className = 'board';

    const ships = g.setups.get(uid);
    const myAtk = new Map();
    for (const a of g.attacks) {
      if (a.attacker === client.userId && a.target === uid) {
        myAtk.set(`${a.row},${a.col}`, a.result);
      }
    }
    const canAttack = isAlive(g, client.userId) && alive;

    renderBoard(boardEl, (r, c) => {
      const k = `${r},${c}`;
      const res = myAtk.get(k);
      if (res === 'hit') return { cls: 'cell-hit', txt: '💥' };
      if (res === 'miss') return { cls: 'cell-miss', txt: '🌊' };
      if (ships && ships.has(k)) return canAttack ? { cls: 'cell-ship', click: true, txt: '🚢' } : { cls: 'cell-ship', txt: '🚢' };
      return canAttack ? { cls: 'cell-target', click: true } : { cls: 'cell-water' };
    }, (r, c, cellEl) => handleAttack(uid, r, c, cellEl));

    wrapper.appendChild(boardEl);
    container.appendChild(wrapper);
  }
}

// Rendering: Players Bar
function renderPlayersBar() {
  const g = games.get(currentGameId);
  if (!g) return;

  const c = $('players-bar');
  c.innerHTML = '';

  for (const [uid] of g.setups) {
    const rem = remaining(g, uid);
    const alive = rem > 0;
    const isMe = uid === client.userId;
    const span = mk('span',
      `px-2 py-1 rounded-full text-xs font-medium ${
        !alive ? 'bg-red-100 text-red-500 line-through' :
        isMe ? 'bg-blue-100 text-blue-700 border border-blue-300' :
        'bg-gray-100 text-gray-600 border border-gray-300'
      }`, `${uid} (${rem})`);
    c.appendChild(span);
  }
}

// Rendering: Game List
function renderGameList(flashId) {
  const c = $('game-list');
  if (games.size === 0) {
    c.innerHTML = '<p class="text-gray-400 text-sm">No games yet. Create or wait for an invitation.</p>';
    return;
  }

  c.innerHTML = '';
  const sorted = [...games.entries()].sort((a, b) => b[1].lastActivity - a[1].lastActivity);
  for (const [rid, g] of sorted) {
    const ap = alivePlayers(g);
    const total = g.setups.size;
    const isActive = rid === currentGameId;

    const div = mk('div', `border rounded p-3 cursor-pointer hover:bg-gray-50 flex justify-between items-center ${isActive ? 'border-blue-400 bg-blue-50' : ''}`, '');
    div.innerHTML = `
      <span class="font-medium text-sm">${escapeHtml(g.title)} [${rid.slice(0, 4)}]</span>
      <span class="text-xs text-gray-500">${total === 0 ? 'new' : `${ap.length}/${total} alive`}</span>
    `;
    if (flashId === rid) div.classList.add('flash-red');
    div.addEventListener('click', () => openGame(rid));
    c.appendChild(div);
  }
}

// Rendering: Battle Log
function renderLog() {
  const g = games.get(currentGameId);
  if (!g) return;

  const c = $('battle-log');
  c.innerHTML = '';
  for (const a of [...g.attacks].reverse()) {
    c.appendChild(logRow(a.attacker, a.target, a.row, a.col, a.result, a.time));
  }
}

function prependLog(attacker, target, row, col, result, time) {
  const r = logRow(attacker, target, row, col, result, time);
  r.classList.add('hit-anim');
  $('battle-log').prepend(r);
}

function logRow(attacker, target, row, col, result, time) {
  const icon = result === 'hit' ? '💥' : '🌊';
  const color = result === 'hit' ? 'text-red-600' : 'text-blue-400';
  const d = mk('div', 'flex justify-between items-center px-3 py-2', '');
  d.innerHTML = `
    <span><strong>${escapeHtml(attacker)}</strong> → ${escapeHtml(target)} at ${cellLabel(row, col)} <span class="${color}">${icon}</span></span>
    <span class="text-gray-400 text-xs">${formatTime(time)}</span>
  `;
  return d;
}
