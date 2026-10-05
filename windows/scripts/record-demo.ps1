<#
.SYNOPSIS
  Records Brink demo screenshots (and optionally a video) on Windows.

.DESCRIPTION
  Launches `Brink.exe --demo`, which starts the fake in-process Notion (sample pages Groceries,
  Launch plan, Sprint, Reading), a throwaway storage folder in %TEMP%\BrinkDemo-<pid>, the dusk
  backdrop window and the scripted DemoDirector. Your pins, token, settings and autostart entry
  are never touched. The director and this script talk through marker files in a folder:

    shot-ready          the app is warmed up         -> script starts ffmpeg, writes shot-go
    shot-go             (script) start the timeline
    shot-<n>-<name>     "take still <name> now"      -> script captures, writes shot-<n>-<name>-done
    shot-capture-open   the quick capture box is up  -> script types the demo text with SendKeys,
                                                        writes shot-capture-open-done
    shot-seg-*          segment starts, logged to segments.txt for trimming the video
    shot-done           the timeline ended           -> script writes shot-done-done, stops, cleans up

  HOW TO RUN (100, 150 and 200 percent)
    Windows cannot change the display scale from a script without signing out, so run this three
    times. Set Settings > System > Display > Scale to 100 percent, run the script, change to 150,
    run it again, then 200. Files are named <still>-<scale>pct.png, so the runs do not overwrite.

  BEFORE YOU START
    * Close Brink (the tray icon too). A second launch would hand over to the running instance
      and the demo flags would be lost. The script refuses to run while Brink is open.
    * Do not touch the mouse or keyboard while it runs (about a minute). SendKeys needs focus.
    * Use a clean desktop. The backdrop covers it, but notifications would still show on top.
    * Video needs ffmpeg on PATH (winget install Gyan.FFmpeg) or -FfmpegPath.

.EXAMPLE
  .\record-demo.ps1 -ExePath ..\src-tauri\target\release\Brink.exe
  .\record-demo.ps1 -ExePath C:\Brink\Brink.exe -Video -OutDir D:\shots
  .\record-demo.ps1 -DemoScript screens   # the screenshot set only, no capture box typing
#>
[CmdletBinding()]
param(
  [string]$ExePath = (Join-Path $PSScriptRoot '..\src-tauri\target\release\Brink.exe'),
  [string]$OutDir = (Join-Path $PSScriptRoot '..\docs\screens\m9-windows'),
  [ValidateSet('full', 'screens')][string]$DemoScript = 'full',
  [switch]$Video,
  [string]$FfmpegPath = 'ffmpeg',
  [int]$ExpectScale = 0,
  [string]$CaptureText = 'Call Anna tomorrow 5pm',
  [int]$ReadyTimeoutSec = 90,
  [int]$RunTimeoutSec = 240
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public static class BrinkDpi {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern uint GetDpiForSystem();
}
'@

# --- Preconditions ---------------------------------------------------------------------------
if (-not (Test-Path -LiteralPath $ExePath)) { throw "Brink.exe not found at $ExePath (use -ExePath)." }
if (Get-Process -Name 'Brink' -ErrorAction SilentlyContinue) {
  throw 'Brink is running. Quit it from the tray icon first, then run this script again.'
}
# Real pixels, not scaled ones: this must run before the first Screen query.
[void][BrinkDpi]::SetProcessDPIAware()
$scale = [int][math]::Round([BrinkDpi]::GetDpiForSystem() / 96.0 * 100)
if ($ExpectScale -gt 0 -and $ExpectScale -ne $scale) {
  throw "Display scale is $scale percent but -ExpectScale is $ExpectScale. Change it in Settings, Display."
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$OutDir = (Resolve-Path -LiteralPath $OutDir).Path
$markers = Join-Path $env:TEMP ('brink-demo-markers-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $markers | Out-Null
Write-Host "Scale $scale percent. Markers in $markers. Output in $OutDir"

function Write-Marker([string]$name) {
  Set-Content -LiteralPath (Join-Path $markers "shot-$name") -Value '' -Encoding ascii
}
function Wait-Marker([string]$name, [int]$timeoutSec) {
  $path = Join-Path $markers "shot-$name"
  $end = (Get-Date).AddSeconds($timeoutSec)
  while (-not (Test-Path -LiteralPath $path)) {
    if ((Get-Date) -gt $end) { throw "Timed out waiting for shot-$name." }
    Start-Sleep -Milliseconds 100
  }
}

# Graphics.CopyFromScreen of the primary monitor, saved as PNG.
function Save-Still([string]$name) {
  $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $file = Join-Path $OutDir ("{0}-{1}pct.png" -f $name, $scale)
    $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "  still $file"
  } finally {
    $g.Dispose(); $bmp.Dispose()
  }
}

# --- Optional video (ffmpeg gdigrab) ---------------------------------------------------------
$ffmpeg = $null
function Start-Video {
  $out = Join-Path $OutDir ("demo-{0}pct.mp4" -f $scale)
  $ffArgs = @('-y', '-f', 'gdigrab', '-framerate', '60', '-draw_mouse', '0', '-i', 'desktop',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', $out)
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $FfmpegPath
  $psi.Arguments = ($ffArgs | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }) -join ' '
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true   # 'q' on stdin makes ffmpeg finish the file cleanly
  $psi.CreateNoWindow = $true
  $script:ffmpeg = [System.Diagnostics.Process]::Start($psi)
  Write-Host "  video $out"
}
function Stop-Video {
  if ($null -eq $script:ffmpeg) { return }
  try { $script:ffmpeg.StandardInput.WriteLine('q') } catch { }
  if (-not $script:ffmpeg.WaitForExit(15000)) { $script:ffmpeg.Kill() }
}

# --- Run -------------------------------------------------------------------------------------
$app = $null
try {
  $app = Start-Process -FilePath $ExePath -PassThru -ArgumentList @(
    '--demo', "--demo-script=$DemoScript", "--demo-markers=$markers")
  Write-Host "Brink demo started (pid $($app.Id)). Waiting for the warm-up."
  Wait-Marker 'ready' $ReadyTimeoutSec
  # Park the real pointer in the bottom left corner, away from the notch's hover zone.
  $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point 4, ($screen.Height - 4)
  if ($Video) { Start-Video }
  Write-Marker 'go'

  $seen = New-Object 'System.Collections.Generic.HashSet[string]'
  $segments = Join-Path $OutDir ("segments-{0}pct.txt" -f $scale)
  Set-Content -LiteralPath $segments -Value "go $(Get-Date -Format o)"
  $end = (Get-Date).AddSeconds($RunTimeoutSec)
  while (-not (Test-Path -LiteralPath (Join-Path $markers 'shot-done'))) {
    if ((Get-Date) -gt $end) { throw "The demo did not finish within $RunTimeoutSec seconds." }
    if ($app.HasExited) { throw 'Brink exited during the demo.' }
    foreach ($f in Get-ChildItem -LiteralPath $markers -Filter 'shot-*') {
      $name = $f.Name.Substring(5)
      if ($name -in @('ready', 'go', 'done') -or $name.EndsWith('-done')) { continue }
      if (-not $seen.Add($name)) { continue }
      if ($name -like 'seg-*') {
        Add-Content -LiteralPath $segments -Value "$name $(Get-Date -Format o)"
      } elseif ($name -eq 'capture-open') {
        # The capture box has OS focus: type like a person, then tell the director to continue.
        # SendKeys treats + ^ % ~ ( ) { } as special, so keep -CaptureText free of them.
        Start-Sleep -Milliseconds 400
        [System.Windows.Forms.SendKeys]::SendWait($CaptureText)
        Start-Sleep -Milliseconds 600
        Write-Marker 'capture-open-done'
      } elseif ($name -match '^\d+-') {
        Start-Sleep -Milliseconds 150   # let the last animation frame land
        Save-Still $name
        Write-Marker "$name-done"
      }
    }
    Start-Sleep -Milliseconds 50
  }
  Add-Content -LiteralPath $segments -Value "done $(Get-Date -Format o)"
  Write-Marker 'done-done'
  Write-Host 'Timeline finished.'
} finally {
  Stop-Video
  if ($null -ne $app -and -not $app.HasExited) {
    # The director quits the app itself after shot-done-done; this is only the safety net.
    if (-not $app.WaitForExit(8000)) { Stop-Process -Id $app.Id -Force }
  }
  Remove-Item -LiteralPath $markers -Recurse -Force -ErrorAction SilentlyContinue
  Get-ChildItem -Path $env:TEMP -Filter 'BrinkDemo-*' -Directory -ErrorAction SilentlyContinue |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host "Done. Screenshots: $OutDir"
