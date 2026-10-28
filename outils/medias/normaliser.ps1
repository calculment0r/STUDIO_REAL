<#
.SYNOPSIS
  Encode un média aux réglages de référence du spectacle avec ffmpeg.
.DESCRIPTION
  telephone : H.264 main 720x1280 (vertical), 30 i/s, AAC 96k, moov en tête, image clé toutes les 2 s.
  scene     : H.264 high 1920x1080, 30 i/s, AAC 192k, moov en tête, image clé toutes les 2 s.
  son       : audio seul, MP3 128k (la sortie doit se terminer par .mp3).
.EXAMPLE
  .\normaliser.ps1 -Entree brut.mov -Sortie intro.mp4 -Cible telephone
.EXAMPLE
  .\normaliser.ps1 -Entree ambiance.wav -Sortie ambiance.mp3 -Cible son
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Entree,
  [Parameter(Mandatory = $true)][string]$Sortie,
  [Parameter(Mandatory = $true)][ValidateSet('telephone', 'scene', 'son')][string]$Cible,
  [switch]$Ecraser
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Write-Error "ffmpeg est introuvable dans le PATH. Installer ffmpeg (par exemple : winget install Gyan.FFmpeg) puis rouvrir le terminal."
  exit 2
}
if (-not (Test-Path -LiteralPath $Entree -PathType Leaf)) {
  Write-Error "Fichier d'entrée introuvable : $Entree"
  exit 2
}
if ([IO.Path]::GetFullPath($Entree) -eq [IO.Path]::GetFullPath($Sortie)) {
  Write-Error "La sortie doit être différente de l'entrée."
  exit 2
}

$extension = [IO.Path]::GetExtension($Sortie).ToLowerInvariant()
if ($Cible -eq 'son' -and $extension -ne '.mp3') {
  Write-Error "La cible « son » écrit un .mp3 : donner une sortie qui se termine par .mp3."
  exit 2
}
if ($Cible -ne 'son' -and $extension -ne '.mp4') {
  Write-Error "Les cibles « telephone » et « scene » écrivent un .mp4 : donner une sortie qui se termine par .mp4."
  exit 2
}

$ecrasement = if ($Ecraser) { '-y' } else { '-n' }

if ($Cible -eq 'son') {
  $arguments = @('-hide_banner', $ecrasement, '-i', $Entree,
    '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', $Sortie)
}
else {
  if ($Cible -eq 'telephone') {
    $largeur = 720; $hauteur = 1280
    $reglagesVideo = @('-profile:v', 'main', '-level:v', '3.1', '-preset', 'slow', '-crf', '23', '-maxrate', '1800k', '-bufsize', '3600k')
    $debitAudio = '96k'
  }
  else {
    $largeur = 1920; $hauteur = 1080
    $reglagesVideo = @('-profile:v', 'high', '-level:v', '4.1', '-preset', 'slow', '-crf', '20', '-maxrate', '8M', '-bufsize', '16M')
    $debitAudio = '192k'
  }
  $filtre = "scale=${largeur}:${hauteur}:force_original_aspect_ratio=decrease,pad=${largeur}:${hauteur}:(ow-iw)/2:(oh-ih)/2:black,fps=30,format=yuv420p"
  $arguments = @('-hide_banner', $ecrasement, '-i', $Entree, '-vf', $filtre, '-c:v', 'libx264') + $reglagesVideo + @(
    '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', $debitAudio, '-ac', '2', '-ar', '48000',
    '-movflags', '+faststart',
    '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1', '-dn', '-sn',
    $Sortie)
}

Write-Host "ffmpeg $($arguments -join ' ')"
& ffmpeg @arguments
if ($LASTEXITCODE -ne 0) {
  Write-Error "ffmpeg a échoué (code $LASTEXITCODE)."
  exit $LASTEXITCODE
}
Write-Host "Terminé : $Sortie"
