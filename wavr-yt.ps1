<#
.SYNOPSIS
  wavr-yt — Download YouTube audio to Wavr's music folder
.DESCRIPTION
  Downloads audio from YouTube (single video, playlist, or multiple URLs)
  using yt-dlp and ffmpeg. Songs are saved as MP3 at maximum quality with
  embedded title, artist, and cover art metadata.
.PARAMETER Urls
  One or more YouTube URLs (video, playlist, or mixed).
.EXAMPLE
  .\wavr-yt.ps1 https://youtu.be/dQw4w9WgXcQ
.EXAMPLE
  .\wavr-yt.ps1 "https://youtube.com/playlist?list=..."
.EXAMPLE
  .\wavr-yt.ps1 https://youtu.be/abc https://youtu.be/xyz
#>

param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Urls
)

$ErrorActionPreference = "Stop"

$WavrDir = Join-Path ([Environment]::GetFolderPath('MyMusic')) 'Wavr'
$Green  = "$([char]27)[38;5;154m"
$Dim    = "$([char]27)[2m"
$Red    = "$([char]27)[31m"
$Bold   = "$([char]27)[1m"
$Reset  = "$([char]27)[0m"

function Check-Dep {
  param([string]$Name, [string]$WingetId)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Write-Host "${Red}Missing: $Name${Reset}"
    Write-Host "Install with: winget install $WingetId"
    exit 1
  }
}

Check-Dep 'yt-dlp' 'yt-dlp.yt-dlp'
Check-Dep 'ffmpeg'  'FFmpeg.FFmpeg'

if ($Urls.Count -eq 0) {
  Write-Host "${Bold}wavr-yt${Reset} — download YouTube audio to Wavr"
  Write-Host ""
  Write-Host "Usage: wavr-yt <YouTube URL> [URL2] [URL3] ..."
  Write-Host ""
  Write-Host "Examples:"
  Write-Host "  wavr-yt https://youtu.be/dQw4w9WgXcQ"
  Write-Host "  wavr-yt 'https://youtube.com/playlist?list=...'"
  Write-Host "  wavr-yt https://youtu.be/abc https://youtu.be/xyz"
  exit 0
}

New-Item -ItemType Directory -Force -Path $WavrDir | Out-Null

Write-Host "${Green}${Bold}wavr-yt${Reset}"
Write-Host "${Dim}Output: $WavrDir${Reset}"
Write-Host ""

$TmpDir = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_ }
try {
  $ytArgs = @(
    '--extract-audio',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '--embed-thumbnail',
    '--embed-metadata',
    '--add-metadata',
    '--parse-metadata', '%(title)s:%(meta_title)s',
    '--parse-metadata', '%(uploader)s:%(meta_artist)s',
    '--output', "$TmpDir\%(title)s.%(ext)s",
    '--no-playlist-reverse',
    '--ignore-errors',
    '--no-warnings',
    '--progress'
  ) + $Urls

  & yt-dlp @ytArgs
  if ($LASTEXITCODE -ne 0) {
    Write-Host "${Dim}(some videos in the batch/playlist were unavailable or failed — continuing with what downloaded)${Reset}"
  }

  $Moved = 0
  $Skipped = 0
  foreach ($f in Get-ChildItem "$TmpDir\*.mp3" -ErrorAction SilentlyContinue) {
    $dest = Join-Path $WavrDir $f.Name
    if (Test-Path $dest) {
      Write-Host "${Dim}Skipped (exists): $($f.Name)${Reset}"
      $Skipped++
    } else {
      Move-Item $f.FullName $dest
      Write-Host "${Green}✓${Reset} $($f.Name)"
      $Moved++
    }
  }

  Write-Host ""
  if ($Moved -gt 0) {
    Write-Host "${Green}${Bold}Done!${Reset} $Moved song$(if ($Moved -ne 1) { 's' }) saved to $WavrDir"
    Write-Host "${Dim}Open Wavr and click Sync folder or Add songs to import them.${Reset}"
  } else {
    Write-Host "${Dim}Nothing new downloaded.${Reset}"
  }
  if ($Skipped -gt 0) {
    Write-Host "${Dim}$Skipped already existed, skipped.${Reset}"
  }
} finally {
  Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue
}
