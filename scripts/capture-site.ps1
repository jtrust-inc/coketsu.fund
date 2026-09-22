param([string]$BaseUrl = 'https://coketsu.fund/', [int]$MaxPages = 500)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$captureRoot = Join-Path $projectRoot 'migration-source'
$siteRoot = Join-Path $captureRoot 'site'
if (Test-Path -LiteralPath $captureRoot) { Remove-Item -LiteralPath $captureRoot -Recurse -Force }
New-Item -ItemType Directory -Path $siteRoot -Force | Out-Null

$base = [Uri]$BaseUrl
Add-Type -AssemblyName System.Net.Http
$client = [System.Net.Http.HttpClient]::new()
$client.DefaultRequestHeaders.UserAgent.ParseAdd('Mozilla/5.0 (compatible; CoketsuBackupMirror/1.0)')
$pages = [System.Collections.Generic.Queue[Uri]]::new()
$pages.Enqueue($base)
$seenPages = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$seenAssets = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$pageRecords = [System.Collections.Generic.List[object]]::new()
$assetRecords = [System.Collections.Generic.List[object]]::new()
$assetQueue = [System.Collections.Generic.Queue[Uri]]::new()
$skipPrefixes = @('/wp-admin','/wp-login.php','/wp-json','/feed','/comments/feed')
$guard = '<style id="backup-mirror-style">#backup-mirror-notice{position:fixed;z-index:2147483647;left:0;right:0;bottom:0;padding:10px 16px;background:#132f27;color:#fff;text-align:center;font:600 13px/1.4 system-ui,sans-serif;box-shadow:0 -2px 12px #0003}</style><div id="backup-mirror-notice" role="status">&#12496;&#12483;&#12463;&#12450;&#12483;&#12503;&#12539;&#35079;&#35069;&#29872;&#22659;&#12391;&#12377;&#12290;&#12501;&#12457;&#12540;&#12512;&#36865;&#20449;&#12289;&#20250;&#21729;&#30331;&#37682;&#12289;&#25237;&#36039;&#30003;&#36796;&#12399;&#28961;&#21177;&#12391;&#12377;&#12290;</div><script id="backup-mirror-guard">document.addEventListener("submit",function(e){e.preventDefault();e.stopImmediatePropagation();alert(document.getElementById("backup-mirror-notice").textContent);},true);</script>'

function LocalPath([Uri]$uri, [bool]$html) {
  $path = [Uri]::UnescapeDataString($uri.AbsolutePath).TrimStart('/')
  if ($html) {
    if (-not $path) { return 'index.html' }
    if ($path.EndsWith('/')) { return ($path + 'index.html') }
    if ([IO.Path]::GetExtension($path) -match '^\.html?$') { return $path }
    return ($path + '/index.html')
  }
  if (-not $path) { return 'asset' }
  return $path
}
function IsInternal([Uri]$uri) { return $uri.Host -ieq $base.Host -and $uri.Scheme -in @('http','https') }
function Normalize([Uri]$uri) {
  $builder = [UriBuilder]$uri; $builder.Fragment = ''; $builder.Query = ''
  if ($builder.Path -ne '/' -and -not $builder.Path.EndsWith('/') -and -not [IO.Path]::GetExtension($builder.Path)) { $builder.Path += '/' }
  return $builder.Uri
}
function QueueAsset([Uri]$uri) {
  if (-not (IsInternal $uri)) { return }
  $clean = Normalize $uri
  if ($seenAssets.Add($clean.AbsoluteUri)) { $assetQueue.Enqueue($clean) }
}
function ExtractUrls([string]$content, [Uri]$context, [bool]$discoverPages) {
  $patterns = @('(?i)(?:href|src|poster|data-src)\s*=\s*["'']([^"''#]+)', '(?i)url\(\s*["'']?([^\)"'']+)', '(?i)srcset\s*=\s*["'']([^"'']+)')
  foreach ($pattern in $patterns) {
    foreach ($match in [regex]::Matches($content, $pattern)) {
      $values = if ($pattern -like '*srcset*') { $match.Groups[1].Value -split ',' | ForEach-Object { ($_ -split '\s+')[0] } } else { @($match.Groups[1].Value) }
      foreach ($raw in $values) {
        if (-not $raw -or $raw -match '^[\\\s]' -or $raw -match '^(data:|mailto:|tel:|javascript:)') { continue }
        try { $uri = [Uri]::new($context, [System.Net.WebUtility]::HtmlDecode($raw)) } catch { continue }
        if (-not (IsInternal $uri)) { continue }
        $clean = Normalize $uri
        if ($clean.AbsolutePath -match '(^|/)r/$') { continue }
        $extension = [IO.Path]::GetExtension($clean.AbsolutePath).ToLowerInvariant()
        $looksPage = -not $extension -or $extension -match '^\.html?$'
        if ($discoverPages -and $looksPage -and -not ($skipPrefixes | Where-Object { $clean.AbsolutePath.StartsWith($_) })) {
          if (-not $seenPages.Contains($clean.AbsoluteUri)) { $pages.Enqueue($clean) }
        } elseif (-not $looksPage) { QueueAsset $clean }
      }
    }
  }
}

while ($pages.Count -gt 0 -and $seenPages.Count -lt $MaxPages) {
  $uri = $pages.Dequeue()
  if (-not $seenPages.Add($uri.AbsoluteUri)) { continue }
  try {
    $response = $client.GetAsync($uri).GetAwaiter().GetResult()
    if (-not $response.IsSuccessStatusCode) { continue }
    $type = $response.Content.Headers.ContentType.MediaType
    if ($type -notmatch 'text/html') { QueueAsset $uri; continue }
    $html = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    # The production reCAPTCHA site key is not valid on the Worker hostname.
    # Forms are disabled in the mirror, so omit the integration instead of
    # displaying a misleading domain error to visitors.
    $html = [regex]::Replace($html, '(?is)<script\b[^>]*\bid=["''](?:google-recaptcha-js|wpcf7-recaptcha-js-before|wpcf7-recaptcha-js)["''][^>]*>.*?</script>\s*', '')
    ExtractUrls $html $uri $true
    $html = $html.Replace('https://coketsu.fund','').Replace('http://coketsu.fund','')
    $html = [regex]::Replace($html, '(?is)<form\b([^>]*)>', '<form$1 data-backup-disabled="true">')
    $html = if ($html -match '(?i)</body>') { [regex]::Replace($html, '(?i)</body>', "$guard</body>", 1) } else { $html + $guard }
    $relative = LocalPath $uri $true
    $destination = Join-Path $siteRoot $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    [IO.File]::WriteAllText($destination, $html, [Text.UTF8Encoding]::new($false))
    $pageRecords.Add([pscustomobject]@{ url=$uri.AbsoluteUri; file=$relative })
    Write-Host "PAGE  $relative"
  } catch { Write-Warning "Page failed: $($uri.AbsoluteUri) - $($_.Exception.Message)" }
}

while ($assetQueue.Count -gt 0) {
  $uri = $assetQueue.Dequeue()
  try {
    $response = $client.GetAsync($uri).GetAwaiter().GetResult()
    if (-not $response.IsSuccessStatusCode) { continue }
    $bytes = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
    $relative = LocalPath $uri $false
    $destination = Join-Path $siteRoot $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    $mediaType = $response.Content.Headers.ContentType.MediaType
    if ($mediaType -match 'text/css|javascript|json|xml|svg') {
      $text = [Text.Encoding]::UTF8.GetString($bytes)
      ExtractUrls $text $uri $false
      $text = $text.Replace('https://coketsu.fund','').Replace('http://coketsu.fund','')
      [IO.File]::WriteAllText($destination, $text, [Text.UTF8Encoding]::new($false))
    } else { [IO.File]::WriteAllBytes($destination, $bytes) }
    $assetRecords.Add([pscustomobject]@{ url=$uri.AbsoluteUri; file=$relative })
    Write-Host "ASSET $relative"
  } catch { Write-Warning "Asset failed: $($uri.AbsoluteUri) - $($_.Exception.Message)" }
}

$manifest = [ordered]@{ source=$BaseUrl; capturedAt=(Get-Date).ToUniversalTime().ToString('o'); pages=$pageRecords; assets=$assetRecords }
$json = $manifest | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText((Join-Path $captureRoot 'manifest.json'), $json, [Text.UTF8Encoding]::new($false))
$client.Dispose()
Write-Host "Captured $($pageRecords.Count) pages and $($assetRecords.Count) assets."
