const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wavr', {
  getLibrary: () => ipcRenderer.invoke('get-library'),
  getPlaylists: () => ipcRenderer.invoke('get-playlists'),
  getPlaylog: () => ipcRenderer.invoke('get-playlog'),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  importSongs: (paths) => ipcRenderer.invoke('import-songs', paths),
  deleteSong: (id) => ipcRenderer.invoke('delete-song', id),
  getAudioPath: (id) => ipcRenderer.invoke('get-audio-path', id),
  getCoverPath: (id) => ipcRenderer.invoke('get-cover-path', id),
  savePlaylist: (pl) => ipcRenderer.invoke('save-playlist', pl),
  deletePlaylist: (id) => ipcRenderer.invoke('delete-playlist', id),
  savePlaylistCover: (data) => ipcRenderer.invoke('save-playlist-cover', data),
  logPlay: (entry) => ipcRenderer.invoke('log-play', entry),
  syncFolder: () => ipcRenderer.invoke('sync-folder'),
  openMusicDir: () => ipcRenderer.invoke('open-music-dir'),
  getLyrics: (id) => ipcRenderer.invoke('get-lyrics', id),
  generateLyricsBatch: (songIds) => ipcRenderer.invoke('generate-lyrics-batch', songIds),
  onLyricsGenProgress: (cb) => ipcRenderer.on('lyrics-gen-progress', (_, data) => cb(data)),
  // called by main when folder watcher detects new files
  onSongsAdded: (cb) => ipcRenderer.on('songs-added', (_, songs) => cb(songs)),
});
