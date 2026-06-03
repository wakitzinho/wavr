const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const MUSIC_DIR = path.join(os.homedir(), 'Music', 'Wavr');
const DATA_DIR = path.join(app.getPath('userData'), 'data');
const DB_FILE = path.join(DATA_DIR, 'library.json');
const PLAYLISTS_FILE = path.join(DATA_DIR, 'playlists.json');
const PLAYLOG_FILE = path.join(DATA_DIR, 'playlog.json');
const COVERS_DIR = path.join(DATA_DIR, 'covers');

const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.ogg', '.wav', '.flac', '.aac', '.opus', '.webm']);

function ensureDirs() {
  [MUSIC_DIR, DATA_DIR, COVERS_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ── SHARED IMPORT LOGIC ───────────────────────────────────────────────────────
// Imports a file that is already sitting in MUSIC_DIR (in-place, no copy)
// or from an external path (copy first). Returns the song object or null.
async function importFileToLibrary(srcPath, library, { copyToMusicDir = true } = {}) {
  let mm;
  try { mm = require('music-metadata'); } catch { mm = null; }

  try {
    const ext = path.extname(srcPath).toLowerCase();
    if (!AUDIO_EXTS.has(ext)) return null;

    const id = crypto.randomUUID();
    let dest;

    if (copyToMusicDir) {
      dest = path.join(MUSIC_DIR, id + ext);
      fs.copyFileSync(srcPath, dest);
    } else {
      // file already lives in MUSIC_DIR — register it in-place
      dest = srcPath;
    }

    let name = path.basename(srcPath, ext);
    let artist = '';
    let album = '';
    let duration = 0;
    let coverPath = null;

    if (mm) {
      try {
        const meta = await mm.parseFile(srcPath, { duration: true });
        const tags = meta.common;
        if (tags.title) name = tags.title;
        if (tags.artist) artist = tags.artist;
        if (tags.album) album = tags.album;
        if (meta.format.duration) duration = meta.format.duration;
        if (tags.picture && tags.picture.length > 0) {
          const pic = tags.picture[0];
          const coverFile = path.join(COVERS_DIR, id + '.jpg');
          fs.writeFileSync(coverFile, pic.data);
          coverPath = coverFile;
        }
      } catch { }
    }

    const song = { id, name, artist, album, duration, coverPath, file: dest, addedAt: Date.now() };
    library.push(song);
    return song;
  } catch (err) {
    console.error('Failed to import', srcPath, err);
    return null;
  }
}

// ── FOLDER SYNC ───────────────────────────────────────────────────────────────
// Scans MUSIC_DIR and imports any audio files not yet in the library.
// Returns array of newly added songs.
async function syncMusicDir() {
  let files;
  try { files = fs.readdirSync(MUSIC_DIR); } catch { return []; }

  const library = readJSON(DB_FILE, []);
  const registeredFiles = new Set(library.map(s => s.file));
  const added = [];

  for (const filename of files) {
    const ext = path.extname(filename).toLowerCase();
    if (!AUDIO_EXTS.has(ext)) continue;

    const fullPath = path.join(MUSIC_DIR, filename);
    if (registeredFiles.has(fullPath)) continue;

    // Make sure the file is fully written (size stable for 500ms)
    try {
      const size1 = fs.statSync(fullPath).size;
      await new Promise(r => setTimeout(r, 500));
      const size2 = fs.statSync(fullPath).size;
      if (size1 !== size2) continue; // still being written, skip for now
    } catch { continue; }

    console.log('[wavr] syncing:', filename);
    const song = await importFileToLibrary(fullPath, library, { copyToMusicDir: false });
    if (song) {
      registeredFiles.add(fullPath);
      added.push(song);
    }
  }

  if (added.length > 0) writeJSON(DB_FILE, library);
  return added;
}

// ── FOLDER WATCHER ────────────────────────────────────────────────────────────
// fs.watch on Linux misses events under heavy load, so we combine it with
// a periodic poll every 5 s while downloads might be happening.
let syncTimer = null;

function scheduleSyncSoon() {
  // Run a sync pass every 5 s for 3 minutes after any activity, then stop
  if (syncTimer) return;
  let ticks = 0;
  syncTimer = setInterval(async () => {
    ticks++;
    const added = await syncMusicDir();
    if (added.length > 0 && win && !win.isDestroyed()) {
      win.webContents.send('songs-added', added);
    }
    if (ticks >= 36) { // 3 minutes
      clearInterval(syncTimer);
      syncTimer = null;
    }
  }, 5000);
}

function startFolderWatch() {
  // inotify watcher — catches events when possible
  try {
    fs.watch(MUSIC_DIR, (event, filename) => {
      if (!filename) return;
      const ext = path.extname(filename).toLowerCase();
      if (!AUDIO_EXTS.has(ext)) return;
      scheduleSyncSoon(); // kick off periodic sync passes
    });
  } catch (e) {
    console.warn('[wavr] fs.watch failed, falling back to polling:', e.message);
  }

  // Also poll every 10 s unconditionally as a safety net
  setInterval(async () => {
    const added = await syncMusicDir();
    if (added.length > 0 && win && !win.isDestroyed()) {
      win.webContents.send('songs-added', added);
    }
  }, 10000);
}

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#111111',
      symbolColor: '#aaaaaa',
      height: 36
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(async () => {
  ensureDirs();

  // Sync any files already in the folder before window opens
  // (covers the case where yt-dlp ran while the app was closed)
  await syncMusicDir();

  createWindow();
  startFolderWatch();

  // After renderer loads, run one more sync and push any stragglers
  win.webContents.once('did-finish-load', async () => {
    const added = await syncMusicDir();
    if (added.length > 0) {
      win.webContents.send('songs-added', added);
    }
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ── IPC HANDLERS ─────────────────────────────────────────────────────────────

ipcMain.handle('get-library', () => readJSON(DB_FILE, []));
ipcMain.handle('get-playlists', () => readJSON(PLAYLISTS_FILE, []));
ipcMain.handle('get-playlog', () => readJSON(PLAYLOG_FILE, []));

ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Add songs to Wavr',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'm4a', 'ogg', 'wav', 'flac', 'aac', 'opus'] }]
  });
  return result.filePaths;
});

ipcMain.handle('import-songs', async (_, filePaths) => {
  const library = readJSON(DB_FILE, []);
  const added = [];
  for (const src of filePaths) {
    const song = await importFileToLibrary(src, library, { copyToMusicDir: true });
    if (song) added.push(song);
  }
  writeJSON(DB_FILE, library);
  return added;
});

ipcMain.handle('delete-song', (_, id) => {
  const library = readJSON(DB_FILE, []);
  const song = library.find(s => s.id === id);
  if (song) {
    try { fs.unlinkSync(song.file); } catch { }
    if (song.coverPath) { try { fs.unlinkSync(song.coverPath); } catch { } }
  }
  const updated = library.filter(s => s.id !== id);
  writeJSON(DB_FILE, updated);

  const playlists = readJSON(PLAYLISTS_FILE, []);
  playlists.forEach(pl => { pl.songs = (pl.songs || []).filter(sid => sid !== id); });
  writeJSON(PLAYLISTS_FILE, playlists);

  return true;
});

ipcMain.handle('get-audio-path', (_, id) => {
  const library = readJSON(DB_FILE, []);
  const song = library.find(s => s.id === id);
  return song ? song.file : null;
});

ipcMain.handle('get-cover-path', (_, id) => {
  const library = readJSON(DB_FILE, []);
  const song = library.find(s => s.id === id);
  return song?.coverPath || null;
});

// Playlists
ipcMain.handle('save-playlist', (_, playlist) => {
  const playlists = readJSON(PLAYLISTS_FILE, []);
  const idx = playlists.findIndex(p => p.id === playlist.id);
  if (idx >= 0) playlists[idx] = playlist;
  else playlists.push(playlist);
  writeJSON(PLAYLISTS_FILE, playlists);
  return playlist;
});

ipcMain.handle('delete-playlist', (_, id) => {
  const playlists = readJSON(PLAYLISTS_FILE, []);
  const pl = playlists.find(p => p.id === id);
  if (pl && pl.coverPath) {
    try { fs.unlinkSync(pl.coverPath); } catch { }
  }
  const updated = playlists.filter(p => p.id !== id);
  writeJSON(PLAYLISTS_FILE, updated);
  return true;
});

ipcMain.handle('save-playlist-cover', (_, { playlistId, dataUrl }) => {
  if (!dataUrl) return null;
  const base64 = dataUrl.split(',')[1];
  const coverFile = path.join(COVERS_DIR, 'pl-' + playlistId + '.jpg');
  fs.writeFileSync(coverFile, Buffer.from(base64, 'base64'));
  return coverFile;
});

// Play log
ipcMain.handle('log-play', (_, entry) => {
  const log = readJSON(PLAYLOG_FILE, []);
  log.push({ ...entry, id: Date.now() + Math.random() });
  // keep last 10000 entries
  if (log.length > 10000) log.splice(0, log.length - 10000);
  writeJSON(PLAYLOG_FILE, log);
  return true;
});

ipcMain.handle('sync-folder', async () => {
  const added = await syncMusicDir();
  return added;
});

ipcMain.handle('open-music-dir', () => {
  const { shell } = require('electron');
  shell.openPath(MUSIC_DIR);
});

ipcMain.handle('get-lyrics', async (_, id) => {
  const library = readJSON(DB_FILE, []);
  const song = library.find(s => s.id === id);
  if (!song) return null;

  const audioPath = song.file;
  const dir = path.dirname(audioPath);

  // Strategy 1: .lrc with same filename as audio (UUID-based)
  const lrcByUuid = audioPath.slice(0, audioPath.lastIndexOf('.')) + '.lrc';

  // Strategy 2: .lrc matching the song's display name (e.g. "Amazing.lrc")
  const lrcByName = path.join(dir, song.name + '.lrc');

  // Strategy 3: case-insensitive scan of directory for matching .lrc
  let lrcByScan = null;
  try {
    const nameLower = song.name.toLowerCase();
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (f.toLowerCase().endsWith('.lrc')) {
        const stem = f.slice(0, f.length - 4).toLowerCase();
        if (stem === nameLower) {
          lrcByScan = path.join(dir, f);
          break;
        }
      }
    }
  } catch { }

  const candidates = [lrcByUuid, lrcByName, lrcByScan].filter(Boolean);
  for (const lrcPath of candidates) {
    if (fs.existsSync(lrcPath)) {
      try {
        console.log('[wavr] Found lyrics:', lrcPath);
        return fs.readFileSync(lrcPath, 'utf8');
      } catch (err) {
        console.error('Failed to read lyrics file:', err);
      }
    }
  }

  return null;
});

// ── LYRICS GENERATION (FoxAIHub API) ─────────────────────────────────────────

const MIME_MAP = {
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
  '.wav': 'audio/wav', '.flac': 'audio/flac', '.aac': 'audio/aac',
  '.opus': 'audio/opus', '.webm': 'audio/webm'
};

function formatLRCTime(totalSeconds) {
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${String(min).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
}

function segmentsToLRC(segments) {
  const lines = [];
  for (const seg of segments) {
    const text = (seg.text || '').trim();
    if (!text) continue;
    lines.push(`[${formatLRCTime(seg.start)}]${text}`);
  }
  return lines.join('\n');
}

ipcMain.handle('generate-lyrics-batch', async (event, songIds) => {
  const library = readJSON(DB_FILE, []);
  const results = [];

  for (let i = 0; i < songIds.length; i++) {
    const song = library.find(s => s.id === songIds[i]);
    if (!song) {
      win.webContents.send('lyrics-gen-progress', { index: i, total: songIds.length, songName: 'Unknown', status: 'error', error: 'Song not found' });
      results.push({ id: songIds[i], success: false, error: 'Song not found' });
      continue;
    }

    try {
      // Step 1: Read and encode audio
      win.webContents.send('lyrics-gen-progress', { index: i, total: songIds.length, songName: song.name, status: 'uploading' });

      const fileBuffer = fs.readFileSync(song.file);
      const ext = path.extname(song.file).toLowerCase();
      const mimeType = MIME_MAP[ext] || 'audio/mpeg';
      const dataUrl = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;

      // Step 2: Submit transcription task
      const submitRes = await fetch('https://foxaihub.com/api/services/transcribe/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_base64: dataUrl })
      });
      if (submitRes.status !== 200) {
        const errBody = await submitRes.text().catch(() => '');
        throw new Error(`API error ${submitRes.status}: ${errBody}`);
      }
      const submitData = await submitRes.json();
      if (!submitData.task_id) throw new Error(submitData.error || 'No task ID');

      // Step 3: Poll for results
      win.webContents.send('lyrics-gen-progress', { index: i, total: songIds.length, songName: song.name, status: 'processing' });

      let result = null;
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise(r => setTimeout(r, 3000));
        const pollRes = await fetch(`https://foxaihub.com/api/services/transcribe/task/${submitData.task_id}`);
        if (pollRes.status !== 200) continue;
        const pollData = await pollRes.json();
        if (!pollData) continue;
        if (pollData.status === 'completed' && pollData.data?.segments) { result = pollData.data; break; }
        if (pollData.status === 'error' || pollData.status === 'failed') throw new Error('Transcription failed');
      }
      if (!result) throw new Error('Timed out');

      // Step 4: Convert to LRC and save
      const lrcContent = segmentsToLRC(result.segments);
      const lrcPath = song.file.slice(0, song.file.lastIndexOf('.')) + '.lrc';
      fs.writeFileSync(lrcPath, lrcContent, 'utf8');

      // Also save with display name for the name-based lookup
      const safeName = song.name.replace(/[/\\?%*:|"<>]/g, '_');
      const lrcByName = path.join(MUSIC_DIR, safeName + '.lrc');
      if (lrcByName !== lrcPath && !fs.existsSync(lrcByName)) {
        fs.writeFileSync(lrcByName, lrcContent, 'utf8');
      }

      console.log('[wavr] Generated lyrics:', lrcPath);
      win.webContents.send('lyrics-gen-progress', { index: i, total: songIds.length, songName: song.name, status: 'done' });
      results.push({ id: song.id, success: true });
    } catch (err) {
      console.error('[wavr] Lyrics gen failed for', song.name, err.message);
      win.webContents.send('lyrics-gen-progress', { index: i, total: songIds.length, songName: song.name, status: 'error', error: err.message });
      results.push({ id: song.id, success: false, error: err.message });
    }
  }

  return results;
});
