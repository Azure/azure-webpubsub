// TODO: Once published to npm, replace with: import { ChatClient } from 'https://unpkg.com/@azure/web-pubsub-chat-client/dist/browser/index.js'
import { ChatClient } from '/@azure/web-pubsub-chat-client/index.js';

// State
let client = null;
let auctions = new Map();   // roomId -> { item, startingPrice, roomId, highestBid, highestBidder }
let currentAuctionId = null;

// DOM refs
const $ = (id) => document.getElementById(id);

// Helpers
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString();
}

function showError(msg) {
  const el = $('login-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// Login

// Click a preset name button → fill input and auto-login
document.querySelectorAll('.name-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $('input-username').value = btn.dataset.name;
    doLogin();
  });
});

$('btn-login').addEventListener('click', doLogin);
$('input-username').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });

async function doLogin() {
  const username = $('input-username').value.trim();
  if (!username) return showError('Please enter a username');

  const btn = $('btn-login');
  const prevText = btn.textContent;
  btn.textContent = 'Logging in...';
  btn.classList.add('opacity-70');
  $('input-username').disabled = true;
  document.querySelectorAll('.name-btn').forEach(b => b.classList.add('opacity-50', 'pointer-events-none'));

  try {
    const resp = await fetch(`/negotiate?userId=${encodeURIComponent(username)}`);
    const { url } = await resp.json();

    client = new ChatClient(url);
    await client.login();

    // Show logged-in state
    btn.textContent = 'Logged in';
    $('display-username').textContent = `✓ Logged in as ${client.userId}`;
    $('login-bar').classList.add('opacity-50', 'pointer-events-none');
    $('main-content').classList.remove('hidden');

    // Remove self from the default bidders input
    const biddersInput = $('input-bidders');
    const others = biddersInput.value.split(',').map(s => s.trim()).filter(s => s.toLowerCase() !== client.userId.toLowerCase());
    biddersInput.value = others.join(', ');

    setupListeners();

    // Restore auctions the user already belongs to (re-login)
    for (const room of client.rooms) {
      await loadAuctionFromRoom(room.roomId, room.title);
    }
    renderAuctionList();
  } catch (e) {
    showError('Login failed: ' + e.message);
    btn.textContent = prevText;
    btn.classList.remove('opacity-70');
    $('input-username').disabled = false;
    document.querySelectorAll('.name-btn').forEach(b => b.classList.remove('opacity-50', 'pointer-events-none'));
  }
}

// Item presets
document.querySelectorAll('.item-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    $('input-item').value = btn.dataset.item;
    $('input-starting-price').value = btn.dataset.price;
  });
});

// Chat SDK listeners
function setupListeners() {
  client.addListenerForNewRoom(async (room) => {
    await loadAuctionFromRoom(room.roomId, room.title);
    renderAuctionList();
    // Auto-open if it's the only auction
    if (auctions.size === 1) openAuction(room.roomId);
  });

  // New message arrives in real time (skip self — already handled locally)
  client.addListenerForNewMessage((notification) => {
    const msg = notification.message;
    const roomId = notification.conversation?.roomId;
    if (!roomId || msg.createdBy === client.userId) return;

    try {
      const data = JSON.parse(msg.content.text);

      // Config message (may arrive after newRoom due to race condition)
      if (data.type === 'config') {
        const auction = auctions.get(roomId);
        if (auction && auction.startingPrice === 0) {
          auction.startingPrice = data.startingPrice;
          auction.highestBid = Math.max(auction.highestBid, data.startingPrice);
          renderAuctionList();
          if (roomId === currentAuctionId) {
            $('auction-meta').textContent = `Starting price: $${auction.startingPrice}`;
            renderHighestBid(auction);
          }
        }
        return;
      }

      if (data.type === 'bid') {
        const auction = auctions.get(roomId);
        if (auction && data.amount > auction.highestBid) {
          auction.highestBid = data.amount;
          auction.highestBidder = msg.createdBy;
        }
        if (roomId === currentAuctionId) {
          renderHighestBid(auction);
          prependBidEntry(msg.createdBy, data.amount, msg.createdAt);
        }
        renderAuctionList();
      }
    } catch { /* ignore non-JSON */ }
  });
}

// Load auction from room messages
async function loadAuctionFromRoom(roomId, title) {
  if (auctions.has(roomId)) return;

  const auction = { item: title, startingPrice: 0, roomId, highestBid: 0, highestBidder: null };

  try {
    const { messages } = await client.listRoomMessage(roomId, null, null);
    for (const msg of messages) {
      try {
        const data = JSON.parse(msg.content.text);
        if (data.type === 'config') {
          auction.startingPrice = data.startingPrice;
          auction.highestBid = data.startingPrice;
        }
        if (data.type === 'bid' && data.amount > auction.highestBid) {
          auction.highestBid = data.amount;
          auction.highestBidder = msg.createdBy;
        }
      } catch { /* skip */ }
    }
  } catch { /* room might be empty */ }

  auctions.set(roomId, auction);
}

// Create auction
$('btn-create').addEventListener('click', async () => {
  const item = $('input-item').value.trim();
  const startingPrice = parseInt($('input-starting-price').value, 10);
  const biddersRaw = $('input-bidders').value.trim();

  if (!item || !startingPrice) {
    alert('Please enter an item name and starting price');
    return;
  }

  const bidders = biddersRaw ? biddersRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

  const btn = $('btn-create');
  btn.disabled = true;
  btn.textContent = 'Creating...';

  try {
    const room = await client.createRoom(item, bidders);
    await client.sendToRoom(room.roomId, JSON.stringify({ type: 'config', startingPrice }));

    auctions.set(room.roomId, {
      item, startingPrice, roomId: room.roomId,
      highestBid: startingPrice, highestBidder: null
    });
    renderAuctionList();
    openAuction(room.roomId); // auto-open the auction we just created
  } catch (e) {
    alert('Failed to create auction: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Start Auction';
  }
});

function itemLabel(auction) {
  const tag = auction.roomId ? auction.roomId.slice(0, 4) : '';
  return tag ? `${auction.item} [${tag}]` : auction.item;
}

// Auction list
function renderAuctionList() {
  const container = $('auction-list');
  if (auctions.size === 0) {
    container.innerHTML = '<p class="text-gray-400 text-sm">No auctions yet. Create one or wait for an invitation.</p>';
    return;
  }

  container.innerHTML = '';
  for (const [roomId, auction] of auctions) {
    const isActive = roomId === currentAuctionId;
    const div = document.createElement('div');
    div.className = `border rounded p-3 cursor-pointer hover:bg-gray-50 flex justify-between items-center ${isActive ? 'border-blue-400 bg-blue-50' : ''}`;
    div.innerHTML = `
      <span class="font-medium">${escapeHtml(itemLabel(auction))}</span>
      <span class="text-sm font-semibold text-green-600">$${auction.highestBid}</span>
    `;
    div.addEventListener('click', () => openAuction(roomId));
    container.appendChild(div);
  }
}

// Open auction
async function openAuction(roomId) {
  const auction = auctions.get(roomId);
  if (!auction) return;

  currentAuctionId = roomId;
  $('auction-title').textContent = itemLabel(auction);
  $('auction-meta').textContent = `Starting price: $${auction.startingPrice}`;
  $('bid-error').classList.add('hidden');

  renderHighestBid(auction);
  await renderBidHistory(roomId);

  $('auction-panel').classList.remove('hidden');
  renderAuctionList(); // highlight the active one
}

function renderHighestBid(auction) {
  $('highest-bid-amount').textContent = `$${auction.highestBid}`;
  $('highest-bid-user').textContent = auction.highestBidder ? `by ${auction.highestBidder}` : '—';

  // Flash effect
  const panel = $('highest-bid-panel');
  panel.classList.remove('bid-flash');
  void panel.offsetWidth;
  panel.classList.add('bid-flash');
}

// Quick bid
document.querySelectorAll('.quick-bid').forEach(btn => {
  btn.addEventListener('click', () => {
    const raise = parseInt(btn.dataset.raise, 10);
    const auction = auctions.get(currentAuctionId);
    if (!auction) return;
    placeBid(auction.highestBid + raise);
  });
});

async function placeBid(amount) {
  const auction = auctions.get(currentAuctionId);
  if (!auction) return;

  if (amount <= auction.highestBid) {
    const el = $('bid-error');
    el.textContent = `Bid must be higher than $${auction.highestBid}`;
    el.classList.remove('hidden');
    return;
  }

  $('bid-error').classList.add('hidden');
  document.querySelectorAll('.quick-bid').forEach(b => b.disabled = true);

  try {
    await client.sendToRoom(currentAuctionId, JSON.stringify({ type: 'bid', amount }));

    auction.highestBid = amount;
    auction.highestBidder = client.userId;

    renderHighestBid(auction);
    prependBidEntry(client.userId, amount, new Date().toISOString());
    renderAuctionList();
  } catch (e) {
    const el = $('bid-error');
    el.textContent = 'Bid failed: ' + e.message;
    el.classList.remove('hidden');
  } finally {
    document.querySelectorAll('.quick-bid').forEach(b => b.disabled = false);
  }
}

// Bid history
async function renderBidHistory(roomId) {
  const container = $('bid-history');
  container.innerHTML = '';

  try {
    const { messages } = await client.listRoomMessage(roomId, null, null);

    const bids = [];
    for (const msg of messages) {
      try {
        const data = JSON.parse(msg.content.text);
        if (data.type === 'bid') {
          bids.push({ user: msg.createdBy, amount: data.amount, time: msg.createdAt });
        }
      } catch { /* skip */ }
    }

    bids.reverse();
    for (const bid of bids) {
      container.appendChild(createBidRow(bid.user, bid.amount, bid.time));
    }

    $('bid-count').textContent = `${bids.length} bid${bids.length !== 1 ? 's' : ''} total`;
  } catch {
    container.innerHTML = '<p class="text-gray-400 p-2">Could not load bid history</p>';
  }
}

function prependBidEntry(user, amount, time) {
  const container = $('bid-history');
  const row = createBidRow(user, amount, time);
  row.classList.add('bid-flash');
  container.prepend(row);

  const countEl = $('bid-count');
  const current = parseInt(countEl.textContent) || 0;
  countEl.textContent = `${current + 1} bid${current + 1 !== 1 ? 's' : ''} total`;
}

function createBidRow(user, amount, time) {
  const row = document.createElement('div');
  row.className = 'flex justify-between items-center px-3 py-2';
  row.innerHTML = `
    <span><strong>${escapeHtml(user)}</strong> bid <span class="text-green-600 font-semibold">$${amount}</span></span>
    <span class="text-gray-400 text-xs">${formatTime(time)}</span>
  `;
  return row;
}
