$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script in an Administrator PowerShell window. No firewall changes were made.'
}
$nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
$settingsLoader = Join-Path $projectRoot 'server\intranet.cjs'
$settingsJson = & $nodeExecutable -e 'const settings = require(process.argv[1]).loadIntranetSettings({loadTls:false}); console.log(JSON.stringify(settings));' $settingsLoader
if ($LASTEXITCODE -ne 0) { throw 'Invalid intranet settings. No firewall changes were made.' }
$config = ($settingsJson -join [Environment]::NewLine) | ConvertFrom-Json
$listenAddress = $config.listenAddress
$ruleName = 'SafetyEdu-Intranet'
$existingRule = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
if ($existingRule) { Remove-NetFirewallRule -Name $ruleName }
New-NetFirewallRule -Name $ruleName -DisplayName 'Safety Education Intranet' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $config.port -LocalAddress $listenAddress -RemoteAddress $config.allowedNetworks -Program $nodeExecutable -Profile Any -EdgeTraversalPolicy Block | Out-Null
Write-Host ('Intranet firewall configured: port ' + $config.port + ', allowed networks ' + ($config.allowedNetworks -join ', '))
