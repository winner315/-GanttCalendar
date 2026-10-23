# Generates the desktop-shortcut icon (three staggered gantt bars) as a
# single-size PNG-in-ICO. Re-run manually if the icon needs regenerating:
#   powershell -NoProfile -File assets\make-icon.ps1
#
# ASCII-only on purpose: Windows PowerShell 5.1 reads .ps1 as ANSI, so UTF-8
# Chinese comments get mangled and break parsing. Explanations live in README.
Add-Type -AssemblyName System.Drawing

$palette = @('#4c8dff', '#ff6b6b', '#f2b737', '#4cc38a', '#9b6bff', '#ff8a3d', '#2fb6c4', '#e85d9c')

function ConvertTo-IcoBytes($bmp) {
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $png = $ms.ToArray()
  $ms.Dispose()

  $out = New-Object System.IO.MemoryStream
  $bw = New-Object System.IO.BinaryWriter($out)
  # ICONDIR: reserved, type, image count
  $bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]1)
  # 256 is recorded as 0 in an ICO directory entry
  $dim = if ($bmp.Width -ge 256) { 0 } else { $bmp.Width }
  $bw.Write([Byte]$dim); $bw.Write([Byte]$dim); $bw.Write([Byte]0); $bw.Write([Byte]0)
  # color planes, bits per pixel
  $bw.Write([UInt16]1); $bw.Write([UInt16]32)
  # payload length, payload offset
  $bw.Write([UInt32]$png.Length); $bw.Write([UInt32]22)
  $bw.Write($png)
  $bw.Flush()
  $bytes = $out.ToArray()
  $bw.Dispose(); $out.Dispose()
  return $bytes
}

function New-GanttIcon([int]$size, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::White)

  $pad = [Math]::Round($size * 0.12)
  $inner = $size - 2 * $pad
  $rows = 3
  $gap = [Math]::Max(1, [Math]::Round($inner * 0.06))
  $barH = [Math]::Floor(($inner - ($rows - 1) * $gap) / $rows)

  # three bars with different spans, so it reads as a gantt chart
  $specs = @(
    @{ row = 0; from = 0.00; to = 0.62; color = $palette[0] },
    @{ row = 1; from = 0.28; to = 1.00; color = $palette[1] },
    @{ row = 2; from = 0.12; to = 0.80; color = $palette[3] }
  )
  foreach ($s in $specs) {
    $y = $pad + $s.row * ($barH + $gap)
    $x = $pad + [Math]::Round($inner * $s.from)
    $w = [Math]::Round($inner * ($s.to - $s.from))
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($s.color))
    $g.FillRectangle($brush, $x, $y, $w, $barH)
    $brush.Dispose()
  }
  $g.Dispose()

  [System.IO.File]::WriteAllBytes($path, (ConvertTo-IcoBytes $bmp))
  $bmp.Dispose()
}

$target = Join-Path $PSScriptRoot 'gantt.ico'
New-GanttIcon 256 $target
Write-Output "written: $target"
