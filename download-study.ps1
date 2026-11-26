$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot '.local-study'
New-Item -ItemType Directory -Path $root -Force | Out-Null
foreach ($month in 1..12) {
    $monthText = '{0:D2}' -f $month
    foreach ($feed in 'damlbmp', 'rtlbmp') {
        $filename = "2025${monthText}01${feed}_zone_csv.zip"
        $archive = Join-Path $root $filename
        if (!(Test-Path -LiteralPath $archive)) {
            $temporary = "$archive.download"
            Invoke-WebRequest "https://mis.nyiso.com/public/csv/$feed/$filename" -OutFile $temporary -TimeoutSec 60
            Move-Item -LiteralPath $temporary -Destination $archive
        }
        Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $root $feed) -Force
    }
}
node (Join-Path $PSScriptRoot 'prepare-study.js')
if ($LASTEXITCODE -ne 0) { throw 'Historical study data preparation failed.' }
