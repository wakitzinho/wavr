# Wavr

A minimal local music player built with Electron. No accounts, no cloud, no tracking. Your music stays on your machine.

---

## Features

- **Library** — import songs from anywhere on your filesystem. Files are copied to `~/Music/Wavr` so you can delete the originals. Beautiful cover art replaces generic song numbers in lists.
- **Playlists** — create playlists with custom cover art and descriptions. Bulk select songs to quickly add them to playlists.
- **Home tab** — see recently played songs, your favourites, and playlists at a glance.
- **Favourites** — star any song to pin it to your home screen.
- **Statistics** — track listening time, top songs, top artists, and a full year heatmap. Toggle between weekly, monthly, and yearly views.
- **Synced Lyrics** — view synchronized `.lrc` lyrics with real-time highlighting and scrolling.
- **Auto-Generate Lyrics** — select multiple songs to automatically transcribe and timestamp lyrics via AI.
- **Customization** — choose from 10 preset accent colors or use a custom hex color to personalize the UI (persists automatically).
- **Folder sync** — drop files into `~/Music/Wavr` and the app picks them up automatically. No manual import needed.
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

If not, install on Arch/EndeavourOS/Manjaro:

```bash
sudo pacman -S nodejs npm
```

On Fedora:

```bash
sudo dnf install nodejs npm
```

On Ubuntu/Debian:

```bash
sudo apt install nodejs npm
```

---

## Installation

### 1. Extract the source

```bash
tar -xzf wavr-wavr.tar.gz
cd wavr
```

### 2. Build the AppImage

```bash
chmod +x build.sh
./build.sh
```

This will download Electron and its dependencies (around 200 MB on first run) and produce an AppImage in the `dist/` folder. It takes a few minutes the first time.

### 3. Run it

```bash
./dist/Wavr-1.0.0.AppImage
```

You can move this file anywhere on your system. Double-clicking it in your file manager will also work as long as AppImage execution is enabled.

To make it executable if needed:

```bash
chmod +x dist/Wavr-1.0.0.AppImage
```

---

## Running in dev mode

If you want to run without building an AppImage first:

```bash
chmod +x run-dev.sh
./run-dev.sh
```

This opens the app directly via Electron with a normal window. Useful for testing changes.

---

## YouTube downloader

Wavr includes a companion script called `wavr-yt` that downloads audio from YouTube and puts it straight into your music folder.

### Install dependencies

```bash
sudo pacman -S yt-dlp ffmpeg
```

On other distros:

```bash
# Fedora
sudo dnf install yt-dlp ffmpeg

# Ubuntu/Debian
sudo apt install yt-dlp ffmpeg
```

### Install the script

```bash
cp wavr-yt.sh ~/.local/bin/wavr-yt
chmod +x ~/.local/bin/wavr-yt
```

Make sure `~/.local/bin` is on your PATH. If it is not, add this to your `~/.bashrc` or `~/.zshrc`:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Then reload your shell:

```bash
source ~/.bashrc
```

### Usage

Download a single video:

```bash
wavr-yt https://youtu.be/dQw4w9WgXcQ
```

Download a full playlist:

```bash
wavr-yt "https://youtube.com/playlist?list=PLxxxxxxxxxxxxxxxx"
```

Download multiple videos at once:

```bash
wavr-yt https://youtu.be/abc https://youtu.be/xyz
```

Songs are saved as MP3 at maximum quality with embedded title, artist, and cover art metadata. The app detects new files automatically within a few seconds. If a song does not appear, click "Sync folder" in the sidebar.

---

## Where data is stored

| What | Where |
|---|---|
| Music files | `~/Music/Wavr/` |
| Library index | `~/.config/wavr/data/library.json` |
| Playlists | `~/.config/wavr/data/playlists.json` |
| Play history | `~/.config/wavr/data/playlog.json` |
| Cover art | `~/.config/wavr/data/covers/` |
| Favourites | Browser localStorage (inside the app) |

You can back up your library by copying `~/Music/Wavr/` and `~/.config/wavr/data/`.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `Alt + Right` | Next track |
| `Alt + Left` | Previous track |

---

## Uninstalling

Delete the AppImage, your music folder if you want, and the app data:

```bash
rm ~/path/to/Wavr-1.0.0.AppImage
rm -rf ~/.config/wavr
# Optional: remove your music files too
rm -rf ~/Music/Wavr
```
