[CmdletBinding()]
param([switch]$OneFile)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Build on Windows with Python 3.11 managed by uv.' }
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    uv sync --locked
    if ($LASTEXITCODE -ne 0) { throw 'uv sync --locked failed.' }
    $mode = if ($OneFile) { '--onefile' } else { '--onedir' }
    uv run --locked --no-sync pyinstaller --noconfirm --clean $mode --windowed `
        --name KMeansLab --exclude-module qtpy --exclude-module PyQt6 `
        --exclude-module PySide6 --exclude-module PyQt5 --exclude-module PySide2 `
        --add-data 'frontend:frontend' --add-data 'datasets:datasets' main.py
    if ($LASTEXITCODE -ne 0) { throw 'PyInstaller failed.' }
    $exe = if ($OneFile) { 'dist/KMeansLab.exe' } else { 'dist/KMeansLab/KMeansLab.exe' }
    Write-Output (Resolve-Path $exe)
} finally {
    Pop-Location
}
