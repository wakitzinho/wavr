'use strict';

// ── STATE ─────────────────────────────────────────────────────────────────────
const S = {
  songs: [], playlists: [], playlog: [], favourites: new Set(),
  queue: [], queueIdx: -1, currentId: null,
  playing: false, shuffle: false, repeat: 'none',
  volume: 0.8, page: 'home', activePl: null, statsRange: 'week',
  pendingAddSongId: null, editingPlId: null, coverDataUrl: null,
  lyrics: [], lyricsVisible: false,
  selectMode: false, selected: new Set(),
};

const audio = document.getElementById('audio');
let notifTimer = null;

// ── ACCENT COLOR ──────────────────────────────────────────────────────────────
const ACCENT_PRESETS = [
  { name: 'Lime',    hex: '#c8f55a' },
  { name: 'Cyan',    hex: '#5af5c8' },
  { name: 'Sky',     hex: '#5ac8f5' },
  { name: 'Violet',  hex: '#a78bfa' },
  { name: 'Pink',    hex: '#f55ac8' },
  { name: 'Rose',    hex: '#fb7185' },
  { name: 'Orange',  hex: '#f5955a' },
  { name: 'Amber',   hex: '#f5c85a' },
  { name: 'Mint',    hex: '#34d399' },
  { name: 'White',   hex: '#e2e2e2' },
];
const DEFAULT_ACCENT = '#c8f55a';

function hexToHSL(hex) {
  let r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max-min;
  let h=0, s=0, l=(max+min)/2;
  if (d) { s = l>.5 ? d/(2-max-min) : d/(max+min); h = max===r ? ((g-b)/d+(g<b?6:0))*60 : max===g ? ((b-r)/d+2)*60 : ((r-g)/d+4)*60; }
  return { h, s, l };
}

function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1-l);
  const f = n => { const k = (n+h/30)%12; return Math.round(255*(l - a*Math.max(-1, Math.min(k-3, 9-k, 1)))); };
  return '#' + [f(0),f(8),f(4)].map(x => x.toString(16).padStart(2,'0')).join('');
}

function deriveAccent2(hex) {
  const { h, s, l } = hexToHSL(hex);
  return hslToHex(h, s, Math.max(0, l - 0.08));
}

function deriveHeatmapColors(hex) {
  const { h, s, l } = hexToHSL(hex);
  return {
    hm1: hslToHex(h, s * 0.6, l * 0.25),
    hm2: hslToHex(h, s * 0.7, l * 0.38),
    hm3: hslToHex(h, s * 0.85, l * 0.55),
  };
}

function applyAccentColor(hex) {
  const root = document.documentElement;
  root.style.setProperty('--accent', hex);
  root.style.setProperty('--accent2', deriveAccent2(hex));
  const hm = deriveHeatmapColors(hex);
  root.style.setProperty('--hm1', hm.hm1);
  root.style.setProperty('--hm2', hm.hm2);
  root.style.setProperty('--hm3', hm.hm3);
}

function saveAccentColor(hex) {
  localStorage.setItem('wavr-accent', hex);
  applyAccentColor(hex);
}

function loadAccentColor() {
  const saved = localStorage.getItem('wavr-accent');
  if (saved) applyAccentColor(saved);
}

function getAccentColor() {
  return localStorage.getItem('wavr-accent') || DEFAULT_ACCENT;
}

// ── INIT ──────────────────────────────────────────────────────────────────────
async function init() {
  loadAccentColor();
  S.songs = await wavr.getLibrary();
  S.playlists = await wavr.getPlaylists();
  S.playlog = await wavr.getPlaylog();
  try { S.favourites = new Set(JSON.parse(localStorage.getItem('wavr-favs') || '[]')); } catch { }
  audio.volume = S.volume;
  setVolUI(S.volume);
  bindStaticEvents();
  render();

  wavr.onSongsAdded(newSongs => {
    S.songs.push(...newSongs);
    if (S.page === 'library') renderLibrary();
    else if (S.page === 'home') renderHome();
    notify(`${newSongs.length} song${newSongs.length !== 1 ? 's' : ''} added from folder`);
  });

  if (wavr.onLyricsGenProgress) {
    wavr.onLyricsGenProgress(handleLyricsGenProgress);
  }
}

// ── ROUTING ───────────────────────────────────────────────────────────────────
function navigate(page, plId = null) {
  S.page = page; S.activePl = plId;
  document.querySelectorAll('.nav-item[data-page]').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page));
  document.querySelectorAll('.pl-nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.plid === plId));
  renderContent();
}

function render() { renderSidebarPlaylists(); renderContent(); }

function renderContent() {
  if (S.page === 'home') renderHome();
  else if (S.page === 'library') renderLibrary();
  else if (S.page === 'playlists') S.activePl ? renderPlDetail(S.activePl) : renderPlaylists();
  else if (S.page === 'stats') renderStats();
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
const COLORS = ['#c8f55a', '#5af5c8', '#f55ac8', '#c85af5', '#f5c85a', '#5ac8f5', '#f5955a'];

function renderSidebarPlaylists() {
  const nav = document.getElementById('playlist-nav');
  nav.innerHTML = S.playlists.map((pl, i) => `
    <div class="pl-nav-item${S.activePl === pl.id ? ' active' : ''}" data-plid="${pl.id}">
      <div class="pl-nav-dot" style="background:${COLORS[i % COLORS.length]}"></div>
      <span class="pl-nav-name">${esc(pl.name)}</span>
    </div>`).join('');
  nav.querySelectorAll('.pl-nav-item').forEach(el =>
    el.addEventListener('click', () => navigate('playlists', el.dataset.plid)));
}

// ── HOME ──────────────────────────────────────────────────────────────────────
function renderHome() {
  const c = document.getElementById('content');

  const seenIds = new Set(), recentIds = [];
  for (let i = S.playlog.length - 1; i >= 0 && recentIds.length < 10; i--) {
    const id = S.playlog[i].songId;
    if (!seenIds.has(id) && S.songs.find(s => s.id === id)) { seenIds.add(id); recentIds.push(id); }
  }
  const recentSongs = recentIds.map(id => S.songs.find(s => s.id === id)).filter(Boolean);
  const favSongs = S.songs.filter(s => S.favourites.has(s.id)).slice(0, 10);
  const recentPls = [...S.playlists].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  c.innerHTML = `
    <div class="page-header" style="margin-bottom:28px">
      <div>
        <div class="page-title">${greeting}</div>
        <div class="page-sub">${S.songs.length} songs in your library</div>
      </div>
    </div>

    ${recentSongs.length ? `
    <div class="home-section">
      <div class="home-section-title">Recently played</div>
      <div class="home-song-strip">${recentSongs.map(s => homeSongCard(s)).join('')}</div>
    </div>` : ''}

    ${favSongs.length ? `
    <div class="home-section">
      <div class="home-section-title">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--accent)" stroke="none" style="flex-shrink:0"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        Favourites
      </div>
      <div class="home-song-strip">${favSongs.map(s => homeSongCard(s)).join('')}</div>
    </div>` : ''}

    ${recentPls.length ? `
    <div class="home-section">
      <div class="home-section-title">Playlists</div>
      <div class="home-pl-strip">${recentPls.map(pl => homePlCard(pl)).join('')}</div>
    </div>` : ''}

    ${!recentSongs.length && !favSongs.length && !recentPls.length ? `
    <div class="empty" style="margin-top:80px">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      <div class="empty-title">Welcome to Wavr</div>
      <div class="empty-sub">Add some songs to get started</div>
    </div>` : ''}
    <div style="height:32px"></div>`;

  c.querySelectorAll('.home-song-card').forEach(el =>
    el.addEventListener('click', () => playSong(el.dataset.id, 'library', null)));
  c.querySelectorAll('.home-fav-btn').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); toggleFav(btn.dataset.id); }));
  c.querySelectorAll('.home-pl-card').forEach(el =>
    el.addEventListener('click', () => navigate('playlists', el.dataset.plid)));
}

function homeSongCard(s) {
  const isFav = S.favourites.has(s.id);
  const cover = s.coverPath
    ? `<img src="file://${s.coverPath}" alt="">`
    : `<div class="home-card-placeholder"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity=".3"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`;
  return `<div class="home-song-card${S.currentId === s.id ? ' playing' : ''}" data-id="${s.id}">
    <div class="home-card-cover">
      ${cover}
      <div class="home-card-overlay">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </div>
    </div>
    <div class="home-card-info">
      <div class="home-card-name">${esc(s.name)}</div>
      <div class="home-card-artist">${esc(s.artist || 'Unknown')}</div>
    </div>
    <button class="home-fav-btn${isFav ? ' fav-on' : ''}" data-id="${s.id}" title="${isFav ? 'Unfavourite' : 'Favourite'}">
      <svg width="13" height="13" viewBox="0 0 24 24"
        fill="${isFav ? 'var(--accent)' : 'none'}"
        stroke="${isFav ? 'var(--accent)' : 'currentColor'}"
        stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
    </button>
  </div>`;
}

function homePlCard(pl) {
  const songs = (pl.songs || []).map(id => S.songs.find(s => s.id === id)).filter(Boolean);
  const cvr = pl.coverPath
    ? `<img src="file://${pl.coverPath}" alt="">`
    : `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity=".3"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
  return `<div class="home-pl-card" data-plid="${pl.id}">
    <div class="home-pl-cover">${cvr}</div>
    <div class="home-pl-name">${esc(pl.name)}</div>
    <div class="home-pl-count">${songs.length} song${songs.length !== 1 ? 's' : ''}</div>
  </div>`;
}

// ── FAVOURITES ────────────────────────────────────────────────────────────────
function toggleFav(id) {
  if (S.favourites.has(id)) S.favourites.delete(id);
  else S.favourites.add(id);
  localStorage.setItem('wavr-favs', JSON.stringify([...S.favourites]));
  const on = S.favourites.has(id);
  document.querySelectorAll(`.fav-btn[data-id="${id}"], .home-fav-btn[data-id="${id}"]`).forEach(btn => {
    btn.classList.toggle('fav-on', on);
    const svg = btn.querySelector('svg');
    svg.setAttribute('fill', on ? 'var(--accent)' : 'none');
    svg.setAttribute('stroke', on ? 'var(--accent)' : 'currentColor');
    btn.title = on ? 'Unfavourite' : 'Favourite';
  });
}

// ── LIBRARY ───────────────────────────────────────────────────────────────────
function renderLibrary() {
  const c = document.getElementById('content');
  const selBtn = S.selectMode
    ? `<button class="btn btn-ghost" id="hdr-cancel-select">Cancel</button><button class="btn btn-primary" id="hdr-select">${S.selected.size} selected</button>`
    : `<button class="btn btn-ghost" id="hdr-select">Select</button>`;
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Library</div>
        <div class="page-sub">${S.songs.length} song${S.songs.length !== 1 ? 's' : ''}</div>
      </div>
      <div style="display:flex;gap:8px">
        ${selBtn}
        ${!S.selectMode ? '<button class="btn btn-primary" id="hdr-add">+ Add songs</button>' : ''}
      </div>
    </div>
    <div class="toolbar">
      <input class="search-input" id="lib-search" placeholder="Search songs…">
    </div>
    <div class="song-list" id="song-list">
      ${S.songs.length ? songRows(S.songs, 'library') : emptyState('No songs yet', 'Click "Add songs" to import your music')}
    </div>
    </div>`;
  if (!S.selectMode && document.getElementById('hdr-add')) document.getElementById('hdr-add').onclick = openAddSongs;
  document.getElementById('hdr-select').onclick = () => { S.selectMode = !S.selectMode; S.selected.clear(); renderLibrary(); };
  if (document.getElementById('hdr-cancel-select')) document.getElementById('hdr-cancel-select').onclick = () => { S.selectMode = false; S.selected.clear(); renderLibrary(); };
  document.getElementById('lib-search').oninput = e => {
    const q = e.target.value.toLowerCase();
    const filtered = S.songs.filter(s =>
      s.name.toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q));
    document.getElementById('song-list').innerHTML = songRows(filtered, 'library');
    bindSongRows();
  };
  bindSongRows();
  if (S.selectMode) updateSelectionUI();
}

function songRows(songs, ctx, plId = null) {
  if (!songs.length) return '';
  return songs.map((s, i) => {
    const isFav = S.favourites.has(s.id);
    const isSel = S.selected.has(s.id);
    const selClass = S.selectMode ? ` selectable${isSel ? ' selected' : ''}` : '';
    const numCol = S.selectMode
      ? `<div class="select-check"><svg class="select-check-icon" width="10" height="10" viewBox="0 0 24 24" fill="#0a0a0a" stroke="#0a0a0a" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>`
      : `<div class="song-cover-wrap">
          ${s.coverPath ? `<img class="song-cover-img" src="file://${s.coverPath}" alt="">` : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`}
          <div class="song-play-hint">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
        </div>`;
    return `
    <div class="song-row${S.currentId === s.id ? ' playing' : ''}${selClass}"
      data-id="${s.id}" data-ctx="${ctx}" data-plid="${plId || ''}">
      ${numCol}
      <div class="song-info">
        <div class="song-name${!S.selectMode ? ' song-name-click' : ''}" data-id="${s.id}" data-ctx="${ctx}" data-plid="${plId || ''}">${esc(s.name)}</div>
        <div class="song-artist">${esc(s.artist || 'Unknown artist')}</div>
      </div>
      <div class="song-actions">
        <button class="icon-btn fav-btn${isFav ? ' fav-on' : ''}" data-id="${s.id}" title="${isFav ? 'Unfavourite' : 'Favourite'}">
          <svg width="12" height="12" viewBox="0 0 24 24"
            fill="${isFav ? 'var(--accent)' : 'none'}"
            stroke="${isFav ? 'var(--accent)' : 'currentColor'}"
            stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </button>
        <div class="icon-btn add-to-pl-btn" data-id="${s.id}" title="Add to playlist">+</div>
        ${ctx === 'playlist' ? `<div class="icon-btn rm-from-pl-btn" data-plid="${plId}" data-id="${s.id}" title="Remove" style="color:var(--danger)">×</div>` : ''}
      </div>
      <div class="song-dur">${fmtTime(s.duration || 0)}</div>
    </div>`;
  }).join('');
}

function updateSelectionUI() {
  const hdrSelect = document.getElementById('hdr-select');
  if (hdrSelect) hdrSelect.textContent = `${S.selected.size} selected`;
  
  let bar = document.querySelector('.selection-bar');
  if (S.selected.size === 0) {
    if (bar) bar.remove();
  } else {
    if (!bar) {
      const c = document.getElementById('content');
      c.insertAdjacentHTML('beforeend', `
    <div class="selection-bar">
      <div class="selection-count"><span id="sel-count-num">${S.selected.size}</span> <span id="sel-count-lbl">song${S.selected.size !== 1 ? 's' : ''}</span> selected</div>
      <div class="selection-actions">
        <button class="btn btn-ghost" id="sel-clear">Clear</button>
        <button class="btn-gen-lyrics" id="sel-add-pl" style="background:var(--bg4);color:var(--text)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add to playlist
        </button>
        <button class="btn-gen-lyrics" id="sel-gen-lyrics">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11l5 3v-5z"/><path d="M7 8h10M7 12h10M7 16h5"/></svg>
          Generate Lyrics
        </button>
      </div>
    </div>`);
      bar = document.querySelector('.selection-bar');
      document.getElementById('sel-clear').onclick = () => { S.selected.clear(); document.querySelectorAll('.song-row.selected').forEach(el => el.classList.remove('selected')); updateSelectionUI(); };
      document.getElementById('sel-gen-lyrics').onclick = () => startLyricsGen([...S.selected]);
      document.getElementById('sel-add-pl').onclick = () => openAddToPl([...S.selected]);
    } else {
      document.getElementById('sel-count-num').textContent = S.selected.size;
      document.getElementById('sel-count-lbl').textContent = `song${S.selected.size !== 1 ? 's' : ''}`;
    }
  }
}

function bindSongRows() {
  document.querySelectorAll('.song-row').forEach(row => {
    const id = row.dataset.id, ctx = row.dataset.ctx, plid = row.dataset.plid || null;
    if (S.selectMode) {
      row.addEventListener('click', () => {
        if (S.selected.has(id)) {
          S.selected.delete(id);
          row.classList.remove('selected');
        } else {
          S.selected.add(id);
          row.classList.add('selected');
        }
        updateSelectionUI();
      });
    } else {
      row.addEventListener('dblclick', () => playSong(id, ctx, plid));
      const hint = row.querySelector('.song-play-hint');
      if (hint) hint.addEventListener('click', e => { e.stopPropagation(); playSong(id, ctx, plid); });
      row.addEventListener('contextmenu', e => showCtx(e, id, ctx, plid));
    }
  });
  if (!S.selectMode) {
    document.querySelectorAll('.song-name-click').forEach(el =>
      el.addEventListener('click', e => { e.stopPropagation(); playSong(el.dataset.id, el.dataset.ctx, el.dataset.plid || null); }));
  }
  document.querySelectorAll('.fav-btn').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); toggleFav(btn.dataset.id); }));
  document.querySelectorAll('.add-to-pl-btn').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); openAddToPl(btn.dataset.id); }));
  document.querySelectorAll('.rm-from-pl-btn').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); removeSongFromPl(btn.dataset.plid, btn.dataset.id); }));
}

// ── PLAYLISTS ─────────────────────────────────────────────────────────────────
function renderPlaylists() {
  const c = document.getElementById('content');
  c.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Playlists</div></div>
      <button class="btn btn-primary" id="hdr-new-pl">+ New playlist</button>
    </div>
    <div class="pl-grid">
      ${S.playlists.map(pl => plCard(pl)).join('')}
      <div class="pl-add-card" id="add-pl-card">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        <span style="font-size:13px;font-weight:500">New playlist</span>
      </div>
    </div>`;
  document.getElementById('hdr-new-pl').onclick = openCreatePl;
  document.getElementById('add-pl-card').onclick = openCreatePl;
  document.querySelectorAll('.pl-card').forEach(el =>
    el.addEventListener('click', () => navigate('playlists', el.dataset.plid)));
}

function plCard(pl) {
  const songs = (pl.songs || []).map(id => S.songs.find(s => s.id === id)).filter(Boolean);
  return `<div class="pl-card" data-plid="${pl.id}">
    <div class="pl-card-cover">${coverHtml(pl, songs)}</div>
    <div class="pl-card-info">
      <div class="pl-card-name">${esc(pl.name)}</div>
      ${pl.description ? `<div class="pl-card-desc">${esc(pl.description)}</div>` : ''}
      <div class="pl-card-count">${songs.length} song${songs.length !== 1 ? 's' : ''}</div>
    </div>
  </div>`;
}

function coverHtml(pl, songs) {
  if (pl.coverPath) return `<img src="file://${pl.coverPath}" alt="">`;
  if (songs.length >= 4) {
    const covers = songs.slice(0, 4).filter(s => s.coverPath);
    if (covers.length >= 4) return `<div class="pl-mosaic">${covers.slice(0, 4).map(s => `<div><img src="file://${s.coverPath}" alt=""></div>`).join('')}</div>`;
  }
  return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity=".3"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
}

function renderPlDetail(plId) {
  const pl = S.playlists.find(p => p.id === plId);
  if (!pl) return renderPlaylists();
  const songs = (pl.songs || []).map(id => S.songs.find(s => s.id === id)).filter(Boolean);
  const totalDur = songs.reduce((a, s) => a + (s.duration || 0), 0);
  const cvr = pl.coverPath
    ? `<img src="file://${pl.coverPath}" alt="">`
    : `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity=".3"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
  const c = document.getElementById('content');
  c.innerHTML = `
    <div class="pl-detail-header">
      <div class="pl-detail-cover">${cvr}</div>
      <div>
        <div class="pl-detail-label">Playlist</div>
        <div class="pl-detail-name">${esc(pl.name)}</div>
        ${pl.description ? `<div class="pl-detail-desc">${esc(pl.description)}</div>` : ''}
        <div style="display:flex;gap:6px">
          <span class="badge">${songs.length} songs</span>
          <span class="badge">${fmtDuration(totalDur)}</span>
        </div>
      </div>
    </div>
    <div class="pl-actions">
      <button class="btn btn-primary" id="pl-play-btn">▶ Play all</button>
      <button class="btn btn-ghost" id="pl-edit-btn">Edit</button>
      <button class="btn btn-danger" id="pl-del-btn">Delete</button>
    </div>
    <div class="song-list" id="song-list">
      ${songs.length ? songRows(songs, 'playlist', plId) : emptyState('Empty playlist', 'Right-click songs in your library to add them here')}
    </div>`;
  document.getElementById('pl-play-btn').onclick = () => playPlaylist(plId);
  document.getElementById('pl-edit-btn').onclick = () => openEditPl(plId);
  document.getElementById('pl-del-btn').onclick = () => deletePl(plId);
  bindSongRows();
}

// ── STATS ─────────────────────────────────────────────────────────────────────
function renderStats() {
  const range = S.statsRange;
  const now = Date.now();
  const ms = { week: 7 * 864e5, month: 30 * 864e5, year: 365 * 864e5 };
  const filtered = S.playlog.filter(l => now - l.ts < ms[range]);
  const totalSec = filtered.reduce((a, l) => a + (l.dur || 0), 0);
  const plays = filtered.length;
  const unique = new Set(filtered.map(l => l.songId)).size;
  const days = range === 'week' ? 7 : range === 'month' ? 30 : 365;
  const avgHrs = ((totalSec / 3600) / days).toFixed(1);
  const songCounts = {}, artistCounts = {};
  filtered.forEach(l => {
    songCounts[l.songId] = (songCounts[l.songId] || 0) + 1;
    artistCounts[l.artist || 'Unknown'] = (artistCounts[l.artist || 'Unknown'] || 0) + 1;
  });
  const topSongs = Object.entries(songCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([id, c]) => ({ song: S.songs.find(s => s.id === id), count: c })).filter(x => x.song);
  const topArtists = Object.entries(artistCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([a, c]) => ({ artist: a, count: c }));
  const c = document.getElementById('content');
  c.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Statistics</div></div>
      <div style="position:relative">
        <button class="color-picker-btn" id="color-picker-btn" title="Change accent color">
          <div class="swatch-dot"></div>
        </button>
        <div class="color-picker-popup" id="color-picker-popup" style="display:none">
          <div class="color-picker-title">Accent color</div>
          <div class="color-swatches" id="color-swatches">
            ${ACCENT_PRESETS.map(p => `<div class="color-swatch${getAccentColor().toLowerCase() === p.hex.toLowerCase() ? ' active' : ''}" data-color="${p.hex}" style="background:${p.hex}" title="${p.name}"></div>`).join('')}
          </div>
          <div class="color-picker-divider"></div>
          <div class="color-picker-custom">
            <label>Custom</label>
            <input type="color" class="color-picker-custom-input" id="color-custom-input" value="${getAccentColor()}">
            <input type="text" class="color-picker-hex" id="color-hex-input" value="${getAccentColor()}" maxlength="7" spellcheck="false">
          </div>
        </div>
      </div>
    </div>
    <div style="padding:0 26px;margin-bottom:18px">
      <div class="tabs">
        <button class="tab${range === 'week' ? ' active' : ''}" data-r="week">This week</button>
        <button class="tab${range === 'month' ? ' active' : ''}" data-r="month">This month</button>
        <button class="tab${range === 'year' ? ' active' : ''}" data-r="year">This year</button>
      </div>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Hours listened</div><div class="stat-val">${(totalSec / 3600).toFixed(1)}<span class="stat-unit">hrs</span></div></div>
      <div class="stat-card"><div class="stat-label">Songs played</div><div class="stat-val">${plays}</div></div>
      <div class="stat-card"><div class="stat-label">Unique songs</div><div class="stat-val">${unique}</div></div>
      <div class="stat-card"><div class="stat-label">Daily avg</div><div class="stat-val">${avgHrs}<span class="stat-unit">hrs</span></div></div>
    </div>
    <div class="stats-section">
      <div class="stats-section-title">Activity</div>
      <div class="chart-box"><canvas id="bar-chart" height="130"></canvas></div>
    </div>
    <div class="stats-section">
      <div class="stats-section-title">Listening heatmap — past year</div>
      <div class="chart-box" id="heatmap-box"></div>
    </div>
    <div class="stats-section">
      <div class="two-col">
        <div>
          <div class="stats-section-title">Top songs</div>
          ${topSongs.length ? `<div class="top-list">${topSongs.map((x, i) => `
            <div class="top-item"><span class="top-rank">${i + 1}</span>
              <div class="top-info"><div class="top-name">${esc(x.song.name)}</div><div class="top-sub">${esc(x.song.artist || 'Unknown')}</div></div>
              <span class="top-count">${x.count}×</span></div>`).join('')}</div>`
      : '<div style="color:var(--text3);font-size:13px;padding:4px 0">No data yet</div>'}
        </div>
        <div>
          <div class="stats-section-title">Top artists</div>
          ${topArtists.length ? `<div class="top-list">${topArtists.map((x, i) => `
            <div class="top-item"><span class="top-rank">${i + 1}</span>
              <div class="top-info"><div class="top-name">${esc(x.artist)}</div><div class="top-sub">${x.count} play${x.count !== 1 ? 's' : ''}</div></div>
              <span class="top-count">${x.count}×</span></div>`).join('')}</div>`
      : '<div style="color:var(--text3);font-size:13px;padding:4px 0">No data yet</div>'}
        </div>
      </div>
    </div>
    <div style="height:40px"></div>`;
  document.querySelectorAll('.tab[data-r]').forEach(btn =>
    btn.addEventListener('click', () => { S.statsRange = btn.dataset.r; renderStats(); }));
  bindColorPicker();
  setTimeout(() => { drawBar(filtered, range); drawHeatmap(); }, 40);
}

function drawBar(logs, range) {
  const canvas = document.getElementById('bar-chart'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.parentElement.clientWidth - 36, H = 130;
  canvas.width = W; canvas.height = H;
  const now = Date.now(); let labels = [], buckets = [];
  if (range === 'week') {
    for (let i = 6; i >= 0; i--) { const d = new Date(now - i * 864e5); labels.push(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]); buckets.push(0); }
    logs.forEach(l => { const a = Math.floor((now - l.ts) / 864e5); if (a < 7) buckets[6 - a] += (l.dur || 0) / 3600; });
  } else if (range === 'month') {
    for (let i = 29; i >= 0; i--) { const d = new Date(now - i * 864e5); labels.push(i % 5 === 0 ? d.getDate() + '' : ''); buckets.push(0); }
    logs.forEach(l => { const a = Math.floor((now - l.ts) / 864e5); if (a < 30) buckets[29 - a] += (l.dur || 0) / 3600; });
  } else {
    const mn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let i = 11; i >= 0; i--) { const d = new Date(now); d.setMonth(d.getMonth() - i); labels.push(mn[d.getMonth()]); buckets.push(0); }
    logs.forEach(l => { const d = new Date(l.ts); const ma = ((new Date(now).getFullYear() - d.getFullYear()) * 12 + new Date(now).getMonth() - d.getMonth()); if (ma < 12) buckets[11 - ma] += (l.dur || 0) / 3600; });
  }
  const max = Math.max(...buckets, 0.01), n = buckets.length;
  const barW = Math.floor((W - 20) / n * 0.6), step = (W - 20) / n;
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
  [0.25, 0.5, 0.75, 1].forEach(f => { const y = 18 + (H - 34) * (1 - f); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); });
  buckets.forEach((v, i) => {
    const bh = Math.max(2, (H - 34) * (v / max)), x = 10 + i * step + (step - barW) / 2, y = H - 16 - bh;
    const accent = getAccentColor();
    const { h, s, l } = hexToHSL(accent);
    const barBg = `hsla(${h},${Math.round(s*100)}%,${Math.round(l*100)}%,0.1)`;
    const barFill = accent;
    const barDim = `hsla(${h},${Math.round(s*100)}%,${Math.round(l*100)}%,0.15)`;
    ctx.fillStyle = barBg; ctx.fillRect(x, 18, barW, H - 34);
    ctx.fillStyle = v > 0 ? barFill : barDim; ctx.fillRect(x, y, barW, bh);
    if (labels[i]) { ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '10px DM Mono,monospace'; ctx.textAlign = 'center'; ctx.fillText(labels[i], x + barW / 2, H - 2); }
  });
}

function drawHeatmap() {
  const box = document.getElementById('heatmap-box'); if (!box) return;
  const grid = {};
  S.playlog.forEach(l => { const k = new Date(l.ts).toISOString().slice(0, 10); grid[k] = (grid[k] || 0) + (l.dur || 0) / 3600; });
  const maxV = Math.max(...Object.values(grid), 0.01);
  const weeks = 52, now = new Date(), start = new Date(now);
  start.setDate(start.getDate() - weeks * 7 + 1);
  const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let colsHtml = '', prevMonth = -1, monthRow = '';
  for (let w = 0; w < weeks; w++) {
    const wStart = new Date(start); wStart.setDate(wStart.getDate() + w * 7);
    const mo = wStart.getMonth();
    monthRow += `<div class="heatmap-month-label">${mo !== prevMonth ? months[mo] : ''}</div>`;
    prevMonth = mo;
    let cells = '';
    for (let d = 0; d < 7; d++) {
      const date = new Date(start); date.setDate(date.getDate() + w * 7 + d);
      const key = date.toISOString().slice(0, 10), v = grid[key] || 0;
      const level = v === 0 ? 0 : v < maxV * .25 ? 1 : v < maxV * .5 ? 2 : v < maxV * .75 ? 3 : 4;
      cells += `<div class="hm-cell" data-v="${level}" title="${key}${v ? ': ' + v.toFixed(1) + 'h' : ''}"></div>`;
    }
    colsHtml += `<div class="heatmap-col">${cells}</div>`;
  }
  box.innerHTML = `<div class="heatmap-container">
    <div class="heatmap-day-labels">${dayLabels.map(l => `<div class="heatmap-day-label">${l}</div>`).join('')}</div>
    <div>
      <div style="display:flex;gap:2px;margin-bottom:4px">${monthRow}</div>
      <div style="display:flex;gap:2px">${colsHtml}</div>
      <div style="display:flex;gap:4px;align-items:center;margin-top:10px">
        <span style="font-size:10px;color:var(--text3)">Less</span>
        ${[0, 1, 2, 3, 4].map(v => `<div class="hm-cell" data-v="${v}" style="flex-shrink:0"></div>`).join('')}
        <span style="font-size:10px;color:var(--text3)">More</span>
      </div>
    </div>
  </div>`;
}

// ── COLOR PICKER ──────────────────────────────────────────────────────────────
function bindColorPicker() {
  const btn = document.getElementById('color-picker-btn');
  const popup = document.getElementById('color-picker-popup');
  if (!btn || !popup) return;

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const showing = popup.style.display !== 'none';
    popup.style.display = showing ? 'none' : 'block';
    if (!showing) {
      const closer = ev => {
        if (!popup.contains(ev.target) && ev.target !== btn) {
          popup.style.display = 'none';
          document.removeEventListener('click', closer);
        }
      };
      setTimeout(() => document.addEventListener('click', closer), 0);
    }
  });

  popup.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      const color = sw.dataset.color;
      saveAccentColor(color);
      popup.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      document.getElementById('color-custom-input').value = color;
      document.getElementById('color-hex-input').value = color;
      // Re-draw charts with new color
      setTimeout(() => { renderStats(); }, 20);
    });
  });

  const customInput = document.getElementById('color-custom-input');
  const hexInput = document.getElementById('color-hex-input');

  customInput.addEventListener('input', e => {
    const color = e.target.value;
    saveAccentColor(color);
    hexInput.value = color;
    popup.querySelectorAll('.color-swatch').forEach(s =>
      s.classList.toggle('active', s.dataset.color.toLowerCase() === color.toLowerCase()));
    setTimeout(() => { drawBar(S.playlog, S.statsRange); drawHeatmap(); }, 20);
  });

  hexInput.addEventListener('input', e => {
    let val = e.target.value.trim();
    if (!val.startsWith('#')) val = '#' + val;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      saveAccentColor(val);
      customInput.value = val;
      popup.querySelectorAll('.color-swatch').forEach(s =>
        s.classList.toggle('active', s.dataset.color.toLowerCase() === val.toLowerCase()));
      setTimeout(() => { drawBar(S.playlog, S.statsRange); drawHeatmap(); }, 20);
    }
  });
}

// ── PLAYBACK ──────────────────────────────────────────────────────────────────
async function playSong(id, ctx, plId) {
  let queue = [];
  if (ctx === 'library') queue = S.songs.map(s => s.id);
  else if (ctx === 'playlist') {
    const pl = S.playlists.find(p => p.id === plId);
    queue = (pl?.songs || []).filter(sid => S.songs.find(s => s.id === sid));
  }
  if (!queue.includes(id)) queue = [id];
  S.queue = queue; S.queueIdx = queue.indexOf(id);
  await doPlay(id);
}

async function playPlaylist(plId) {
  const pl = S.playlists.find(p => p.id === plId);
  if (!pl?.songs?.length) return;
  S.queue = pl.songs.filter(id => S.songs.find(s => s.id === id));
  S.queueIdx = 0;
  await doPlay(S.queue[0]);
}

let playStartTs = 0;
async function doPlay(id) {
  const song = S.songs.find(s => s.id === id); if (!song) return;
  const filePath = await wavr.getAudioPath(id); if (!filePath) return;
  if (S.currentId) logCurrentPlay();
  const fileUrl = 'file://' + filePath.split('/').map((p, i) => i === 0 ? p : encodeURIComponent(p)).join('/');
  audio.src = fileUrl; audio.load();
  try { await audio.play(); } catch (e) { console.error('Playback failed:', e); return; }
  S.currentId = id; S.playing = true; playStartTs = Date.now();
  document.getElementById('player-song').textContent = song.name;
  document.getElementById('player-artist').textContent = song.artist || 'Unknown artist';
  document.getElementById('titlebar-song').textContent = song.name + (song.artist ? ' · ' + song.artist : '');
  setPlayIcon(true);
  const thumb = document.getElementById('player-thumb');
  const coverPath = await wavr.getCoverPath(id);
  thumb.innerHTML = coverPath
    ? `<img src="file://${coverPath}" alt="">`
    : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
  document.querySelectorAll('.song-row').forEach(el => el.classList.toggle('playing', el.dataset.id === id));
  document.querySelectorAll('.home-song-card').forEach(el => el.classList.toggle('playing', el.dataset.id === id));

  // Now Playing view updates
  if (coverPath) {
    document.getElementById('np-cover').src = `file://${coverPath}`;
    document.getElementById('np-cover').style.display = 'block';
    document.getElementById('np-cover-placeholder').style.display = 'none';
  } else {
    document.getElementById('np-cover').src = '';
    document.getElementById('np-cover').style.display = 'none';
    document.getElementById('np-cover-placeholder').style.display = 'flex';
  }

  // Lyrics
  document.getElementById('lyrics-song').textContent = song.name;
  document.getElementById('lyrics-artist').textContent = song.artist || 'Unknown artist';
  S.lyrics = [];
  S.lyricsSynced = false;
  document.getElementById('lyrics-container').innerHTML = '<div class="empty" style="padding-top:40px">Searching for lyrics…</div>';
  const lrc = await wavr.getLyrics(id);
  if (lrc) {
    const parsed = parseLRC(lrc);
    if (parsed.synced) {
      S.lyrics = parsed.lines;
      S.lyricsSynced = true;
    } else {
      S.lyrics = parsed.lines;
      S.lyricsSynced = false;
    }
    renderLyrics();
  } else {
    document.getElementById('lyrics-container').innerHTML = '<div class="empty" style="padding-top:40px">No lyrics found (.lrc)</div>';
  }
}

function parseLRC(lrc) {
  const lines = lrc.split(/\r?\n/);
  const result = [];
  const timeRegex = /\[(\d+):(\d+(?:\.\d+)?)\]/;
  let hasTimestamps = false;
  for (const line of lines) {
    const match = timeRegex.exec(line);
    if (match) {
      hasTimestamps = true;
      const min = parseInt(match[1]);
      const sec = parseFloat(match[2]);
      const time = min * 60 + sec;
      const text = line.replace(timeRegex, '').trim();
      if (text) result.push({ time, text });
    }
  }
  if (hasTimestamps) {
    return { synced: true, lines: result.sort((a, b) => a.time - b.time) };
  }
  // Plain text lyrics — no timestamps
  const plainLines = lines.map(l => l.trim()).filter(l => l.length > 0);
  return { synced: false, lines: plainLines.map(text => ({ time: -1, text })) };
}

function renderLyrics() {
  const container = document.getElementById('lyrics-container');
  if (!S.lyrics.length) {
    container.innerHTML = '<div class="empty" style="padding-top:40px">No lyrics found (.lrc)</div>';
    return;
  }
  container.innerHTML = S.lyrics.map((l, i) => `<div class="lyric-line${!S.lyricsSynced ? ' unsynced' : ''}" data-idx="${i}" data-time="${l.time}">${esc(l.text)}</div>`).join('');
  if (S.lyricsSynced) {
    container.querySelectorAll('.lyric-line').forEach(el => {
      el.onclick = () => {
        audio.currentTime = parseFloat(el.dataset.time);
        if (!S.playing) togglePlay();
      };
    });
  }
}

function updateLyricsUI() {
  if (!S.lyricsVisible || !S.lyrics.length || !S.lyricsSynced) return;
  const cur = audio.currentTime;
  let activeIdx = -1;
  for (let i = 0; i < S.lyrics.length; i++) {
    if (S.lyrics[i].time <= cur + 0.1) activeIdx = i;
    else break;
  }
  const container = document.getElementById('lyrics-container');
  const els = container.querySelectorAll('.lyric-line');
  els.forEach((el, i) => {
    const active = i === activeIdx;
    if (el.classList.contains('active') !== active) {
      el.classList.toggle('active', active);
      if (active) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

function toggleLyrics() {
  S.lyricsVisible = !S.lyricsVisible;
  const view = document.getElementById('lyrics-view');
  view.classList.toggle('show', S.lyricsVisible);
  const btn = document.getElementById('btn-lyrics');
  if (btn) btn.classList.toggle('on', S.lyricsVisible);
  if (S.lyricsVisible) updateLyricsUI();
}

function logCurrentPlay() {
  if (!S.currentId || !playStartTs) return;
  const dur = Math.min((Date.now() - playStartTs) / 1000, audio.duration || 9999);
  if (dur < 5) return;
  const song = S.songs.find(s => s.id === S.currentId);
  const entry = { ts: playStartTs, songId: S.currentId, dur, artist: song?.artist || 'Unknown' };
  wavr.logPlay(entry); S.playlog.push(entry); playStartTs = 0;
}

function setPlayIcon(playing) {
  document.getElementById('play-icon').style.display = playing ? 'none' : 'block';
  document.getElementById('pause-icon').style.display = playing ? 'block' : 'none';
  document.getElementById('np-play-icon').style.display = playing ? 'none' : 'block';
  document.getElementById('np-pause-icon').style.display = playing ? 'block' : 'none';
}

audio.addEventListener('timeupdate', () => {
  const cur = audio.currentTime, dur = audio.duration || 0;
  document.getElementById('time-cur').textContent = fmtTime(cur);
  document.getElementById('time-dur').textContent = fmtTime(dur);
  document.getElementById('np-time-cur').textContent = fmtTime(cur);
  document.getElementById('np-time-dur').textContent = fmtTime(dur);
  const pct = dur ? cur / dur * 100 : 0;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-thumb').style.left = pct + '%';
  document.getElementById('np-progress-fill').style.width = pct + '%';
  document.getElementById('np-progress-thumb').style.left = pct + '%';
  updateLyricsUI();
});

audio.addEventListener('ended', () => {
  logCurrentPlay();
  if (S.repeat === 'one') { audio.play(); return; }
  if (S.queueIdx < S.queue.length - 1 || S.repeat === 'all') playNext();
  else { S.playing = false; setPlayIcon(false); }
});

function togglePlay() {
  if (!S.currentId) return;
  if (S.playing) { audio.pause(); S.playing = false; setPlayIcon(false); }
  else { audio.play(); S.playing = true; setPlayIcon(true); if (!playStartTs) playStartTs = Date.now(); }
}
function playNext() {
  if (!S.queue.length) return; logCurrentPlay();
  const next = S.shuffle ? Math.floor(Math.random() * S.queue.length) : (S.queueIdx + 1) % S.queue.length;
  S.queueIdx = next; doPlay(S.queue[next]);
}
function playPrev() {
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  if (!S.queue.length) return; logCurrentPlay();
  const prev = (S.queueIdx - 1 + S.queue.length) % S.queue.length;
  S.queueIdx = prev; doPlay(S.queue[prev]);
}
function toggleShuffle() {
  S.shuffle = !S.shuffle;
  document.getElementById('btn-shuffle').classList.toggle('on', S.shuffle);
  document.getElementById('np-btn-shuffle').classList.toggle('on', S.shuffle);
}
function toggleRepeat() {
  const modes = ['none', 'all', 'one'];
  S.repeat = modes[(modes.indexOf(S.repeat) + 1) % 3];
  const btn = document.getElementById('btn-repeat');
  const npBtn = document.getElementById('np-btn-repeat');
  const on = S.repeat !== 'none';
  const title = S.repeat === 'one' ? 'Repeat one' : S.repeat === 'all' ? 'Repeat all' : 'Repeat off';
  btn.classList.toggle('on', on);
  npBtn.classList.toggle('on', on);
  btn.title = title;
  npBtn.title = title;
}

// ── DRAGGABLE SLIDERS ─────────────────────────────────────────────────────────
function makeDraggable(trackEl, onValue) {
  let dragging = false;
  const get = e => Math.max(0, Math.min(1, (e.clientX - trackEl.getBoundingClientRect().left) / trackEl.clientWidth));
  trackEl.addEventListener('mousedown', e => { dragging = true; onValue(get(e)); e.preventDefault(); });
  document.addEventListener('mousemove', e => { if (dragging) onValue(get(e)); });
  document.addEventListener('mouseup', () => { dragging = false; });
}

// ── ADD SONGS ─────────────────────────────────────────────────────────────────
async function openAddSongs() {
  const paths = await wavr.openFileDialog();
  if (!paths || !paths.length) return;
  document.getElementById('import-progress').textContent = `Importing ${paths.length} file${paths.length > 1 ? 's' : ''}…`;
  document.getElementById('modal-importing').style.display = 'flex';
  const added = await wavr.importSongs(paths);
  S.songs.push(...added);
  document.getElementById('modal-importing').style.display = 'none';
  render(); notify(`Added ${added.length} song${added.length !== 1 ? 's' : ''}`);
}

// ── PLAYLISTS CRUD ────────────────────────────────────────────────────────────
function openCreatePl() {
  S.editingPlId = null; S.coverDataUrl = null;
  document.getElementById('pl-modal-title').textContent = 'New playlist';
  document.getElementById('pl-name').value = '';
  document.getElementById('pl-desc').value = '';
  document.getElementById('cover-preview').style.display = 'none';
  document.getElementById('cover-label').style.display = '';
  document.getElementById('pl-save').textContent = 'Create';
  document.getElementById('modal-playlist').style.display = 'flex';
}
function openEditPl(id) {
  const pl = S.playlists.find(p => p.id === id); if (!pl) return;
  S.editingPlId = id; S.coverDataUrl = null;
  document.getElementById('pl-modal-title').textContent = 'Edit playlist';
  document.getElementById('pl-name').value = pl.name;
  document.getElementById('pl-desc').value = pl.description || '';
  if (pl.coverPath) {
    document.getElementById('cover-preview').src = `file://${pl.coverPath}`;
    document.getElementById('cover-preview').style.display = 'block';
    document.getElementById('cover-label').style.display = 'none';
  } else {
    document.getElementById('cover-preview').style.display = 'none';
    document.getElementById('cover-label').style.display = '';
  }
  document.getElementById('pl-save').textContent = 'Save';
  document.getElementById('modal-playlist').style.display = 'flex';
}
async function savePl() {
  const name = document.getElementById('pl-name').value.trim(); if (!name) return;
  const desc = document.getElementById('pl-desc').value.trim();
  let coverPath = null;
  if (S.coverDataUrl) {
    const plId = S.editingPlId || ('pl-' + Date.now());
    coverPath = await wavr.savePlaylistCover({ playlistId: plId, dataUrl: S.coverDataUrl });
  }
  if (S.editingPlId) {
    const pl = S.playlists.find(p => p.id === S.editingPlId);
    pl.name = name; pl.description = desc; if (coverPath) pl.coverPath = coverPath;
    await wavr.savePlaylist(pl);
  } else {
    const pl = { id: 'pl-' + Date.now(), name, description: desc, coverPath, songs: [], createdAt: Date.now() };
    S.playlists.push(pl); await wavr.savePlaylist(pl);
  }
  document.getElementById('modal-playlist').style.display = 'none'; render();
}
async function deletePl(id) {
  if (!confirm('Delete this playlist?')) return;
  await wavr.deletePlaylist(id);
  S.playlists = S.playlists.filter(p => p.id !== id); S.activePl = null; navigate('playlists');
}
function openAddToPl(songIds) {
  S.pendingAddSongIds = Array.isArray(songIds) ? songIds : [songIds];
  const picker = document.getElementById('pl-picker');
  picker.innerHTML = S.playlists.length
    ? S.playlists.map(pl => `<div class="pl-pick-item" data-plid="${pl.id}">
        <div style="flex:1"><div class="pl-pick-name">${esc(pl.name)}</div><div class="pl-pick-count">${(pl.songs || []).length} songs</div></div>
      </div>`).join('')
    : '<div style="color:var(--text3);font-size:13px;padding:8px">No playlists yet</div>';
  picker.querySelectorAll('.pl-pick-item').forEach(el => el.addEventListener('click', () => addSongToPl(el.dataset.plid)));
  document.getElementById('modal-add-to-pl').style.display = 'flex';
}
async function addSongToPl(plId) {
  const pl = S.playlists.find(p => p.id === plId); if (!pl) return;
  if (!pl.songs) pl.songs = [];
  let added = 0;
  for (const id of S.pendingAddSongIds) {
    if (!pl.songs.includes(id)) { pl.songs.push(id); added++; }
  }
  if (added > 0) await wavr.savePlaylist(pl);
  document.getElementById('modal-add-to-pl').style.display = 'none';
  if (S.selectMode) { S.selectMode = false; S.selected.clear(); }
  render();
  notify(`Added ${added} song${added !== 1 ? 's' : ''} to ${pl.name}`);
}
async function removeSongFromPl(plId, songId) {
  const pl = S.playlists.find(p => p.id === plId); if (!pl) return;
  pl.songs = (pl.songs || []).filter(id => id !== songId); await wavr.savePlaylist(pl); render();
}

// ── DELETE SONG ───────────────────────────────────────────────────────────────
async function deleteSong(id) {
  if (!confirm('Remove this song from your library? The file in ~/Music/Wavr will also be deleted.')) return;
  if (S.currentId === id) {
    audio.pause(); S.currentId = null; S.playing = false; setPlayIcon(false);
    document.getElementById('player-song').textContent = 'Nothing playing';
    document.getElementById('player-artist').textContent = '—';
    document.getElementById('player-thumb').innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
    document.getElementById('titlebar-song').textContent = '';
  }
  S.favourites.delete(id); localStorage.setItem('wavr-favs', JSON.stringify([...S.favourites]));
  await wavr.deleteSong(id);
  S.songs = S.songs.filter(s => s.id !== id);
  S.playlists.forEach(pl => { pl.songs = (pl.songs || []).filter(sid => sid !== id); });
  render(); notify('Song removed');
}

// ── CONTEXT MENU ──────────────────────────────────────────────────────────────
function showCtx(e, id, ctx, plId) {
  e.preventDefault();
  const isFav = S.favourites.has(id);
  const menu = document.getElementById('ctx-menu');
  menu.innerHTML = `
    <div class="ctx-item" id="ctx-play"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>Play now</div>
    <div class="ctx-item" id="ctx-fav">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="${isFav ? 'var(--accent)' : 'none'}" stroke="${isFav ? 'var(--accent)' : 'currentColor'}" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      ${isFav ? 'Unfavourite' : 'Favourite'}
    </div>
    <div class="ctx-item" id="ctx-add-pl"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add to playlist</div>
    ${ctx === 'playlist' ? `<div class="ctx-item" id="ctx-rm-pl"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>Remove from playlist</div>` : ''}
    <div class="ctx-item danger" id="ctx-del"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>Delete song</div>
    <div class="ctx-item" id="ctx-gen-lyrics"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11l5 3v-5z"/><path d="M7 8h10M7 12h10M7 16h5"/></svg>Generate lyrics</div>`;
  menu.style.display = 'block';
  let x = e.clientX, y = e.clientY;
  if (x + 180 > window.innerWidth) x = window.innerWidth - 190;
  if (y + menu.scrollHeight > window.innerHeight) y = window.innerHeight - menu.scrollHeight - 8;
  menu.style.left = x + 'px'; menu.style.top = y + 'px';
  menu.querySelector('#ctx-play').onclick = () => { playSong(id, ctx, plId); hideCtx(); };
  menu.querySelector('#ctx-fav').onclick = () => { toggleFav(id); hideCtx(); };
  menu.querySelector('#ctx-add-pl').onclick = () => { openAddToPl(id); hideCtx(); };
  if (ctx === 'playlist') menu.querySelector('#ctx-rm-pl').onclick = () => { removeSongFromPl(plId, id); hideCtx(); };
  menu.querySelector('#ctx-del').onclick = () => { deleteSong(id); hideCtx(); };
  menu.querySelector('#ctx-gen-lyrics').onclick = () => { startLyricsGen([id]); hideCtx(); };
  setTimeout(() => document.addEventListener('click', hideCtx, { once: true }), 0);
}
function hideCtx() { document.getElementById('ctx-menu').style.display = 'none'; }

// ── STATIC EVENTS ─────────────────────────────────────────────────────────────
function bindStaticEvents() {
  document.querySelectorAll('.nav-item[data-page]').forEach(el =>
    el.addEventListener('click', () => navigate(el.dataset.page)));

  document.getElementById('btn-add-songs').addEventListener('click', openAddSongs);
  document.getElementById('btn-open-folder').addEventListener('click', () => wavr.openMusicDir());
  document.getElementById('btn-sync-folder').addEventListener('click', async () => {
    notify('Scanning ~/Music/Wavr…');
    const added = await wavr.syncFolder();
    if (added.length > 0) {
      S.songs.push(...added);
      if (S.page === 'library') renderLibrary();
      else if (S.page === 'home') renderHome();
      notify(`Found ${added.length} new song${added.length !== 1 ? 's' : ''}`);
    } else notify('Library is up to date');
  });

  document.getElementById('btn-play').addEventListener('click', togglePlay);
  document.getElementById('btn-next').addEventListener('click', playNext);
  document.getElementById('btn-prev').addEventListener('click', playPrev);
  document.getElementById('btn-shuffle').addEventListener('click', toggleShuffle);
  document.getElementById('btn-repeat').addEventListener('click', toggleRepeat);

  document.getElementById('np-btn-play').addEventListener('click', togglePlay);
  document.getElementById('np-btn-next').addEventListener('click', playNext);
  document.getElementById('np-btn-prev').addEventListener('click', playPrev);
  document.getElementById('np-btn-shuffle').addEventListener('click', toggleShuffle);
  document.getElementById('np-btn-repeat').addEventListener('click', toggleRepeat);

  makeDraggable(document.getElementById('progress-track'), v => {
    if (audio.duration) audio.currentTime = v * audio.duration;
  });
  makeDraggable(document.getElementById('np-progress-track'), v => {
    if (audio.duration) audio.currentTime = v * audio.duration;
  });
  makeDraggable(document.getElementById('vol-track'), v => {
    audio.volume = v; S.volume = v; setVolUI(v);
  });

  const btnLyrics = document.getElementById('btn-lyrics');
  if (btnLyrics) btnLyrics.onclick = toggleLyrics;
  document.getElementById('lyrics-close').onclick = toggleLyrics;
  document.querySelector('.player-left').addEventListener('click', toggleLyrics);
  document.querySelector('.player-left').style.cursor = 'pointer';

  document.getElementById('cover-upload').addEventListener('click', () => document.getElementById('cover-file-input').click());
  document.getElementById('cover-file-input').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      S.coverDataUrl = ev.target.result;
      document.getElementById('cover-preview').src = S.coverDataUrl;
      document.getElementById('cover-preview').style.display = 'block';
      document.getElementById('cover-label').style.display = 'none';
    };
    reader.readAsDataURL(file); e.target.value = '';
  });
  document.getElementById('pl-save').addEventListener('click', savePl);
  document.getElementById('pl-cancel').addEventListener('click', () => document.getElementById('modal-playlist').style.display = 'none');
  document.getElementById('add-to-pl-cancel').addEventListener('click', () => document.getElementById('modal-add-to-pl').style.display = 'none');

  document.querySelectorAll('.overlay').forEach(el =>
    el.addEventListener('click', e => { if (e.target === el) el.style.display = 'none'; }));

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.code === 'KeyL') { e.preventDefault(); toggleLyrics(); }
    else if (e.code === 'ArrowRight' && e.altKey) playNext();
    else if (e.code === 'ArrowLeft' && e.altKey) playPrev();
  });
}

function setVolUI(v) { document.getElementById('vol-fill').style.width = (v * 100) + '%'; }

// ── HELPERS ───────────────────────────────────────────────────────────────────
function fmtTime(s) { if (!s || !isFinite(s)) return '0:00'; const m = Math.floor(s / 60), sec = Math.floor(s % 60); return `${m}:${sec.toString().padStart(2, '0')}`; }
function fmtDuration(s) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; }
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function emptyState(title, sub) { return `<div class="empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg><div class="empty-title">${title}</div><div class="empty-sub">${sub}</div></div>`; }
function notify(msg) { const el = document.getElementById('notification'); el.textContent = msg; el.style.display = 'block'; clearTimeout(notifTimer); notifTimer = setTimeout(() => { el.style.display = 'none'; }, 2500); }

// ── LYRICS GENERATION ─────────────────────────────────────────────────────────
let lyricsGenSongIds = [];

function startLyricsGen(songIds) {
  if (!songIds.length) return;
  lyricsGenSongIds = songIds;
  S.selectMode = false;
  S.selected.clear();
  if (S.page === 'library') renderLibrary();

  const modal = document.getElementById('modal-lyrics-gen');
  const log = document.getElementById('lyrics-gen-log');
  const bar = document.getElementById('lyrics-gen-bar');
  const overall = document.getElementById('lyrics-gen-overall');
  const title = document.getElementById('lyrics-gen-title');
  const actions = document.getElementById('lyrics-gen-actions');

  title.textContent = 'Generating Lyrics…';
  overall.textContent = `0 of ${songIds.length} songs processed`;
  bar.style.width = '0%';
  actions.style.display = 'none';
  log.innerHTML = songIds.map(id => {
    const song = S.songs.find(s => s.id === id);
    return `<div class="lyrics-gen-item" id="lgen-${id}">
      <div class="gen-icon">⏳</div>
      <div class="gen-name">${esc(song?.name || 'Unknown')}</div>
      <div class="gen-status">Waiting…</div>
    </div>`;
  }).join('');
  modal.style.display = 'flex';

  wavr.generateLyricsBatch(songIds).then(results => {
    const ok = results.filter(r => r.success).length;
    const fail = results.filter(r => !r.success).length;
    title.textContent = 'Lyrics Generation Complete';
    overall.textContent = `${ok} succeeded${fail ? `, ${fail} failed` : ''}`;
    bar.style.width = '100%';
    actions.style.display = 'flex';
    document.getElementById('lyrics-gen-close').onclick = () => { modal.style.display = 'none'; };
  });
}

function handleLyricsGenProgress(data) {
  const { index, total, songName, status, error } = data;
  const id = lyricsGenSongIds[index];
  const el = document.getElementById(`lgen-${id}`);
  const bar = document.getElementById('lyrics-gen-bar');
  const overall = document.getElementById('lyrics-gen-overall');

  if (bar) bar.style.width = `${((index + (status === 'done' || status === 'error' ? 1 : 0.5)) / total * 100).toFixed(0)}%`;
  if (overall) overall.textContent = `${status === 'done' || status === 'error' ? index + 1 : index} of ${total} songs processed`;

  if (!el) return;
  const icon = el.querySelector('.gen-icon');
  const statusEl = el.querySelector('.gen-status');

  el.className = 'lyrics-gen-item';
  if (status === 'uploading') {
    el.classList.add('active');
    icon.innerHTML = '<div class="spinner"></div>';
    statusEl.textContent = 'Uploading…';
  } else if (status === 'processing') {
    el.classList.add('active');
    icon.innerHTML = '<div class="spinner"></div>';
    statusEl.textContent = 'Processing…';
  } else if (status === 'done') {
    el.classList.add('done');
    icon.textContent = '✓';
    statusEl.textContent = 'Done';
  } else if (status === 'error') {
    el.classList.add('error');
    icon.textContent = '✗';
    statusEl.textContent = error || 'Failed';
  }

  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

init();
