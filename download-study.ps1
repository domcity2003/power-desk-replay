$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot '.local-study'
New-Item -ItemType Directory -Path $root -Force | Out-Null

# Each entry: feed folder on mis.nyiso.com, archive name suffix, first month (year, month) and last.
# Prices and actual load cover 2025. The load forecast also needs December 2024, because the
# forecast for January 1 was issued on December 31.
$sources = @(
    @{ Feed = 'damlbmp';      Suffix = 'damlbmp_zone_csv'; Months = 1..12 },
    @{ Feed = 'rtlbmp';       Suffix = 'rtlbmp_zone_csv';  Months = 1..12 },
    @{ Feed = 'palIntegrated'; Suffix = 'palIntegrated_csv'; Months = 1..12 },
    @{ Feed = 'isolf';        Suffix = 'isolf_csv';        Months = 0..12 }
)
foreach ($source in $sources) {
    foreach ($month in $source.Months) {
        $year = if ($month -eq 0) { 2024 } else { 2025 }
        $monthText = '{0:D2}' -f $(if ($month -eq 0) { 12 } else { $month })
        $filename = "$year${monthText}01$($source.Suffix).zip"
        $archive = Join-Path $root $filename
        if (!(Test-Path -LiteralPath $archive)) {
            $temporary = "$archive.download"
            Invoke-WebRequest "https://mis.nyiso.com/public/csv/$($source.Feed)/$filename" -OutFile $temporary -TimeoutSec 60
            Move-Item -LiteralPath $temporary -Destination $archive
        }
        Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $root $source.Feed) -Force
    }
}
node (Join-Path $PSScriptRoot 'prepare-study.js')
if ($LASTEXITCODE -ne 0) { throw 'Historical study data preparation failed.' }
