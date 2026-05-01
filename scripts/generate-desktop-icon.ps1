$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

function New-RoundedRectanglePath {
  param(
    [float] $X,
    [float] $Y,
    [float] $Width,
    [float] $Height,
    [float] $Radius
  )

  $diameter = $Radius * 2
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-IconPngBytes {
  param([int] $Size)

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $scale = $Size / 256.0

  $outerPath = New-RoundedRectanglePath (19 * $scale) (19 * $scale) (218 * $scale) (218 * $scale) (54 * $scale)
  $outerBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.RectangleF]::new(19 * $scale, 19 * $scale, 218 * $scale, 218 * $scale),
    [System.Drawing.ColorTranslator]::FromHtml("#0F172A"),
    [System.Drawing.ColorTranslator]::FromHtml("#111827"),
    45
  )
  $graphics.FillPath($outerBrush, $outerPath)

  $panelPath = New-RoundedRectanglePath (36 * $scale) (34 * $scale) (184 * $scale) (188 * $scale) (43 * $scale)
  $panelBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.RectangleF]::new(36 * $scale, 34 * $scale, 184 * $scale, 188 * $scale),
    [System.Drawing.ColorTranslator]::FromHtml("#3B82F6"),
    [System.Drawing.ColorTranslator]::FromHtml("#1D4ED8"),
    45
  )
  $graphics.FillPath($panelBrush, $panelPath)

  $highlightPath = New-RoundedRectanglePath (48 * $scale) (39 * $scale) (160 * $scale) (58 * $scale) (18 * $scale)
  $highlightBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(34, 255, 255, 255))
  $graphics.FillPath($highlightBrush, $highlightPath)

  $markBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(248, 255, 255, 255))
  $lPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $lVertical = New-RoundedRectanglePath (73 * $scale) (61 * $scale) (38 * $scale) (128 * $scale) (8 * $scale)
  $lHorizontal = New-RoundedRectanglePath (73 * $scale) (154 * $scale) (92 * $scale) (35 * $scale) (8 * $scale)
  $lPath.AddPath($lVertical, $false)
  $lPath.AddPath($lHorizontal, $false)
  $graphics.FillPath($markBrush, $lPath)

  $tileBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(238, 236, 245, 255))
  $tileOne = New-RoundedRectanglePath (151 * $scale) (64 * $scale) (34 * $scale) (34 * $scale) (10 * $scale)
  $graphics.FillPath($tileBrush, $tileOne)

  $tileTwoBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(178, 201, 221, 255))
  $tileTwo = New-RoundedRectanglePath (151 * $scale) (112 * $scale) (34 * $scale) (77 * $scale) (11 * $scale)
  $graphics.FillPath($tileTwoBrush, $tileTwo)

  $barBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(118, 141, 184, 255))
  $bar = New-RoundedRectanglePath (168 * $scale) (130 * $scale) (17 * $scale) (59 * $scale) (8.5 * $scale)
  $graphics.FillPath($barBrush, $bar)

  $dotBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#7DD3FC"))
  $graphics.FillEllipse($dotBrush, 178 * $scale, 80 * $scale, 12 * $scale, 12 * $scale)

  $memory = [System.IO.MemoryStream]::new()
  $bitmap.Save($memory, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $memory.ToArray()

  $memory.Dispose()
  $dotBrush.Dispose()
  $barBrush.Dispose()
  $tileTwoBrush.Dispose()
  $tileBrush.Dispose()
  $markBrush.Dispose()
  $highlightBrush.Dispose()
  $panelBrush.Dispose()
  $outerBrush.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()

  Write-Output -NoEnumerate $bytes
}

$iconPath = Join-Path $PSScriptRoot "..\apps\desktop\assets\icon.ico"
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$images = foreach ($size in $sizes) {
  [pscustomobject]@{
    Size = $size
    Bytes = [byte[]](New-IconPngBytes -Size $size)
  }
}

$stream = [System.IO.File]::Create($iconPath)
$writer = [System.IO.BinaryWriter]::new($stream)

$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]$images.Count)

$offset = 6 + (16 * $images.Count)
foreach ($image in $images) {
  $dimensionByte = if ($image.Size -eq 256) { 0 } else { $image.Size }
  $writer.Write([byte]$dimensionByte)
  $writer.Write([byte]$dimensionByte)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]32)
  $writer.Write([uint32]$image.Bytes.Length)
  $writer.Write([uint32]$offset)
  $offset += $image.Bytes.Length
}

foreach ($image in $images) {
  $writer.Write([byte[]]$image.Bytes)
}

$writer.Dispose()
$stream.Dispose()

Write-Host "Generated $iconPath"
