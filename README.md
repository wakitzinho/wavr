# Wavr

A minimal local music player built with Electron. No accounts, no cloud, no tracking. Your music stays on your machine.

---

## Features

- **Library** — import songs from anywhere on your filesystem. Files are copied to your music folder so you can delete the originals. Beautiful cover art replaces generic song numbers in lists.
- **Playlists** — create playlists with custom cover art and descriptions. Bulk select songs to quickly add them to playlists.
- **Home tab** — see recently played songs, your favourites, and playlists at a glance.
- **Favourites** — star any song to pin it to your home screen.
- **Statistics** — track listening time, top songs, top artists, and a full year heatmap. Toggle between weekly, monthly, and yearly views.
- **Synced Lyrics** — view synchronized `.lrc` lyrics with real-time highlighting and scrolling.
- **Auto-Generate Lyrics** — select multiple songs to automatically transcribe and timestamp lyrics via AI.
- **Customization** — choose from 10 preset accent colors or use a custom hex color to personalize the UI (persists automatically).
- **Folder sync** — drop files into your Wavr music folder and the app picks them up automatically. No manual import needed.
- **YouTube downloader** — companion script that downloads audio from YouTube directly into your library using `yt-dlp`.
- **Playback** — shuffle, repeat one, repeat all, draggable progress and volume sliders, keyboard shortcuts.

---

## Requirements

- Node.js 18 or later
- npm

Check if you have them:

```bash
node --version
npm --version
```

### Linux

Arch/EndeavourOS/Manjaro:
```bash
sudo pacman -S nodejs npm
```

Fedora:
```bash
sudo dnf install nodejs npm
```

Ubuntu/Debian:
```bash
sudo apt install nodejs npm
```

### Windows

Download and install Node.js from https://nodejs.org (LTS recommended). npm is included.

---

## Installation

### Linux

#### 1. Extract the source

```bash
tar -xzf wavr-wavr.tar.gz
cd wavr-wavr
```

#### 2. Build the AppImage

```bash
chmod +x build.sh
./build.sh
```

Or manually:

```bash
npm install
npm run build:linux
```

This produces an AppImage in the `dist/` folder. It takes a few minutes the first time.

#### 3. Run it

```bash
./dist/Wavr-1.0.0.AppImage
```

You can move this file anywhere. Double-clicking it in your file manager also works (AppImage execution must be enabled).

```bash
chmod +x dist/Wavr-1.0.0.AppImage
```

---

### Windows

#### 1. Extract the source

Extract the zip to a folder of your choice.

#### 2. Build the installer

Open PowerShell or Command Prompt in the project folder:

```powershell
npm install
npm run build:win
```

This produces:
- **NSIS installer** — `dist/Wavr Setup 1.0.0.exe`
- **Portable exe** — `dist/Wavr 1.0.0.exe`

First build downloads Electron (~200 MB) and takes a few minutes.

#### 3. Run it

Run the installer (`Wavr Setup 1.0.0.exe`) to install Wavr like a normal Windows app. Or use the portable exe — no installation needed, just double-click it.

---

## Running in dev mode

```bash
npm start
```

This opens the app directly via Electron without building. Useful for testing.

---

## YouTube downloader

Wavr includes a companion script called `wavr-yt` that downloads audio from YouTube straight into your music folder.

### Linux

Install dependencies:

```bash
# Arch/EndeavourOS/Manjaro
sudo pacman -S yt-dlp ffmpeg

# Fedora
sudo dnf install yt-dlp ffmpeg

# Ubuntu/Debian
sudo apt install yt-dlp ffmpeg
```

Install the script:

```bash
cp wavr-yt.sh ~/.local/bin/wavr-yt
chmod +x ~/.local/bin/wavr-yt
```

Make sure `~/.local/bin` is on your PATH. If not, add this to `~/.bashrc` or `~/.zshrc`:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

### Windows

Install dependencies (PowerShell as Administrator):

```powershell
winget install yt-dlp.yt-dlp
winget install FFmpeg.FFmpeg
```

After install, restart your terminal so `yt-dlp` and `ffmpeg` are on your PATH.

To use the script, run from anywhere:

```powershell
powershell -ExecutionPolicy Bypass -File C:\path\to\wavr\wavr-yt.ps1 <URL>
```

Or create a shortcut/batch file pointing to it.

### Usage

Single video:

```bash
wavr-yt https://youtu.be/dQw4w9WgXcQ
```

Full playlist:

```bash
wavr-yt "https://youtube.com/playlist?list=PLxxxxxxxxxxxxxxxx"
```

Multiple videos:

```bash
wavr-yt https://youtu.be/abc https://youtu.be/xyz
```

Songs are saved as MP3 at maximum quality with embedded title, artist, and cover art. The app detects new files automatically within a few seconds.

---

## Where data is stored

| What | Linux | Windows |
|---|---|---|
| Music files | `~/Music/Wavr/` | `%USERPROFILE%\Music\Wavr\` |
| Library index | `~/.config/wavr/data/library.json` | `%APPDATA%\wavr\data\library.json` |
| Playlists | `~/.config/wavr/data/playlists.json` | `%APPDATA%\wavr\data\playlists.json` |
| Play history | `~/.config/wavr/data/playlog.json` | `%APPDATA%\wavr\data\playlog.json` |
| Cover art | `~/.config/wavr/data/covers/` | `%APPDATA%\wavr\data\covers\` |
| Favourites | Browser localStorage (inside the app) | Browser localStorage (inside the app) |

Back up your library by copying the music folder and the config/data folder shown above.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `Alt + Right` | Next track |
| `Alt + Left` | Previous track |

---

## Uninstalling

### Linux

```bash
rm ~/path/to/Wavr-1.0.0.AppImage
rm -rf ~/.config/wavr
# Optional: remove your music files too
rm -rf ~/Music/Wavr
```

### Windows

Uninstall via **Settings → Apps → Wavr** (NSIS installer), or delete the portable exe.

To remove all app data:

```powershell
Remove-Item -Recurse -Force "$env:APPDATA\wavr"
# Optional: remove music
Remove-Item -Recurse -Force "$env:USERPROFILE\Music\Wavr"
```

---

## Windows-specific notes

Things to verify if testing on an actual Windows machine:

- **Title bar overlay** — The hidden title bar + overlay (`titleBarOverlay` in `src/main.js`) works on Windows 10/11, but the 36px height may need adjustment for Windows caption buttons (they're typically taller than on Linux). If buttons look cramped or overlap content, increase `height` in the `titleBarOverlay` config.
- **Window shadow** — Frameless windows on Windows don't get the native drop shadow. This is cosmetic — the window will still work fine.
- **File dialog** — `dialog.showOpenDialog` is cross-platform, but the native dialog look differs. Functionality is identical.
- **fs.watch** — On Windows, `fs.watch` uses `ReadDirectoryChangesW` which is more reliable than on Linux, so folder watching should actually work better.
- **Keyboard shortcuts** — `Alt+Left`/`Alt+Right` may conflict with browser-like back/forward in some Windows contexts. Test and change to `Ctrl+Left`/`Ctrl+Right` if needed.
- **System tray** — Wavr doesn't use a tray icon, so no Windows tray concerns.
