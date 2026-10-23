# Creates a desktop shortcut that launches the web app via WScript.Shell.
#
# ASCII-only on purpose: Windows PowerShell 5.1 reads .ps1 as ANSI and decodes
# command-line arguments with the same ANSI codepage, so a UTF-8 Chinese name
# would arrive as mojibake whichever way it is passed. The name is therefore
# read from a UTF-8 file (asset-src\shortcut-name.txt) with an explicit
# encoding instead of being hardcoded or passed on the command line.
param(
  [string]$NameFile = (Join-Path $PSScriptRoot 'shortcut-name.txt'),
  [string]$Name,
  [string]$Target = (Join-Path (Split-Path -Parent $PSScriptRoot) 'start.bat'),
  [string]$Icon = (Join-Path $PSScriptRoot 'gantt.ico'),
  [string]$WorkDir = (Split-Path -Parent $PSScriptRoot),
  [string]$Desktop = [Environment]::GetFolderPath('Desktop')
)

if (-not $Name) {
  if (-not (Test-Path $NameFile)) { throw "name file not found: $NameFile" }
  $Name = ([System.IO.File]::ReadAllText($NameFile, [System.Text.Encoding]::UTF8)).Trim()
  # strip a UTF-8 BOM if the editor added one
  $Name = $Name.TrimStart([char]0xFEFF)
}
if (-not $Name) { throw "shortcut name is empty" }

if (-not (Test-Path $Target)) { throw "target not found: $Target" }
if (-not (Test-Path $Icon)) { throw "icon not found: $Icon; run make-icon.ps1 first" }

$linkPath = Join-Path $Desktop "$Name.lnk"
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($linkPath)
$sc.TargetPath = $Target
$sc.WorkingDirectory = $WorkDir
$sc.IconLocation = "$Icon,0"
$sc.Description = 'GanttCalendar web - local schedule gantt viewer'
# 1 = normal window; start.bat minimizes the server window itself
$sc.WindowStyle = 1
$sc.Save()

if (-not (Test-Path $linkPath)) { throw "shortcut was not created: $linkPath" }
Write-Output "written: $linkPath"
