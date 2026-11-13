# 版本快照脚本
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts\snapshot.ps1 -Version "v1.3.3"
#     只打源码（不含 data/、不含 .env），用于日常版本快照
#   powershell -ExecutionPolicy Bypass -File scripts\snapshot.ps1 -Version "v1.3.3" -IncludeData
#     连 data/ 一起打（db.json、上传文件、证书、加密 Key），用于整体迁移到服务器
# 产物：snapshots\<版本号-时间戳>.zip

param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  # 把运行时数据（data/）一起打包；默认不打
  [switch]$IncludeData
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$snapshotDir = Join-Path $root 'snapshots'
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$zipPath = Join-Path $snapshotDir "$Version-$stamp.zip"

if (-not (Test-Path $snapshotDir)) {
  New-Item -ItemType Directory -Path $snapshotDir | Out-Null
}

# 先复制到临时目录并排除不需要打包的内容，再压缩，保证目录结构干净
$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "chatblog-snapshot-$stamp"
if (Test-Path $tempDir) {
  Remove-Item -Recurse -Force $tempDir
}
New-Item -ItemType Directory -Path $tempDir | Out-Null

# 版本包目录也排除：里面全是历史 zip，打进去会让包从 0.5MB 涨到 6MB
$excludeDirs = @('node_modules', 'snapshots', '.git', '版本')
if (-not $IncludeData) {
  $excludeDirs += 'data'
}
# 项目根目录下可能放着给用户的整包 zip，别再打包进去（会越滚越大）
$excludeFiles = @('*.zip')

Push-Location $root
try {
  Get-ChildItem -Path $root -Force | Where-Object {
    if ($excludeDirs -contains $_.Name) { return $false }
    if (-not $_.PSIsContainer) {
      foreach ($pattern in $excludeFiles) {
        if ($_.Name -like $pattern) { return $false }
      }
    }
    return $true
  } | ForEach-Object {
    $target = Join-Path $tempDir $_.Name
    if ($_.PSIsContainer) {
      Copy-Item -Path $_.FullName -Destination $target -Recurse -Force
    } else {
      Copy-Item -Path $_.FullName -Destination $target -Force
    }
  }
} finally {
  Pop-Location
}

# 清理临时目录里的依赖目录，避免把上百 MB 的包打进去
Get-ChildItem -Path $tempDir -Recurse -Directory -Force |
  Where-Object { $_.Name -eq 'node_modules' } |
  ForEach-Object { Remove-Item -Recurse -Force $_.FullName }

# .env 里可能有模型 key 与后台密码，不放进快照，避免快照被转发时泄露
foreach ($secretFile in @('.env', '.env.local')) {
  $secretPath = Join-Path $tempDir $secretFile
  if (Test-Path $secretPath) { Remove-Item -Force $secretPath }
}

Get-ChildItem -Path $tempDir -Recurse -File -Filter '*.log' -ErrorAction SilentlyContinue |
  ForEach-Object { Remove-Item -Force $_.FullName }

# 兜底：临时目录里任何层级的 zip 都清掉（历史版本包不该进新包，否则会自我膨胀）
Get-ChildItem -Path $tempDir -Recurse -File -Filter '*.zip' -ErrorAction SilentlyContinue |
  ForEach-Object { Remove-Item -Force $_.FullName }

# 连数据一起打包时，把审计日志也排掉（属于运行痕迹，不是业务数据）
if ($IncludeData) {
  $logDir = Join-Path $tempDir 'data\logs'
  if (Test-Path $logDir) { Remove-Item -Recurse -Force $logDir }
}

Compress-Archive -Path (Join-Path $tempDir '*') -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item -Recurse -Force $tempDir

$size = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host "快照已生成：$zipPath（$size MB）" -ForegroundColor Green
if ($IncludeData) {
  Write-Host "包含运行时数据：data\（db.json、uploads、certs、secrets、.session-secret）" -ForegroundColor Yellow
  Write-Host "不含 .env：请单独拷贝，或按 .env.example 重建" -ForegroundColor Yellow
}
