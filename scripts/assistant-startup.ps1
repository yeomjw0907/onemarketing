param(
    [ValidateSet('Install', 'Run', 'Status', 'Disable')][string]$Mode = 'Status',
    [string]$NodeExe,
    [string]$WorkerScript,
    [string]$MutexName,
    [ValidateRange(1, 300)][int]$RestartDelaySeconds = 15
)
$ErrorActionPreference = 'Stop'
$taskRepo = Split-Path -Parent $PSScriptRoot
$taskState = Join-Path $env:LOCALAPPDATA 'Onecation'
$taskStartup = Join-Path ([Environment]::GetFolderPath('Startup')) 'Onecation Assistant.lnk'
$taskLauncher = Join-Path $taskState 'assistant-startup.vbs'
$taskPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
function Quote-TaskPath([string]$Value) {
    if ($Value.Contains('"') -or $Value.Contains("`r") -or $Value.Contains("`n")) { throw 'Invalid launcher path.' }
    return '"' + $Value + '"'
}
if ($Mode -eq 'Status') {
    Write-Output ('Automatic startup enabled: ' + (Test-Path -LiteralPath $taskStartup))
    Write-Output ('Startup shortcut: ' + $taskStartup)
    exit 0
}
if ($Mode -eq 'Disable') {
    if (Test-Path -LiteralPath $taskStartup) { Remove-Item -LiteralPath $taskStartup }
    Write-Output 'Automatic startup disabled. The current connection remains running.'
    exit 0
}
if (-not $NodeExe) { $NodeExe = (Get-Command node.exe -ErrorAction Stop).Source }
if (-not $WorkerScript) { $WorkerScript = Join-Path $taskRepo 'scripts\assistant-pc.ts' }
$taskTsx = Join-Path $taskRepo 'node_modules\tsx\dist\cli.mjs'
foreach ($taskPath in @($NodeExe, $WorkerScript, $taskTsx)) {
    if (-not (Test-Path -LiteralPath $taskPath -PathType Leaf)) { throw 'PC connection runtime is missing. Restore the project and dependencies first.' }
}
New-Item -ItemType Directory -Force -Path $taskState | Out-Null
if ($Mode -eq 'Install') {
    if (-not (Test-Path -LiteralPath (Join-Path $taskState 'assistant-device.json'))) { throw 'Pair this PC before enabling automatic startup.' }
    $taskCommand = (Quote-TaskPath $taskPowerShell) + ' -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File ' + (Quote-TaskPath $PSCommandPath) + ' -Mode Run -NodeExe ' + (Quote-TaskPath $NodeExe)
    $taskVbs = "Set shell = CreateObject(""WScript.Shell"")`r`nshell.Run """ + $taskCommand.Replace('"', '""') + """, 0, False`r`n"
    Set-Content -LiteralPath $taskLauncher -Value $taskVbs -Encoding Unicode
    $taskShell = New-Object -ComObject WScript.Shell
    $taskLink = $taskShell.CreateShortcut($taskStartup)
    $taskLink.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
    $taskLink.Arguments = '//B //Nologo ' + (Quote-TaskPath $taskLauncher)
    $taskLink.WorkingDirectory = $taskRepo
    $taskLink.Description = 'Onecation PC assistant connection'
    $taskLink.WindowStyle = 7
    $taskLink.Save()
    Write-Output 'Automatic startup enabled for the current Windows user.'
    exit 0
}
if (-not $MutexName) {
    $taskSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $MutexName = 'Local\Onecation.Assistant.' + $taskSid
}
$taskMutex = New-Object Threading.Mutex($false, $MutexName)
$taskAcquired = $false
try {
    try { $taskAcquired = $taskMutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $taskAcquired = $true }
    if (-not $taskAcquired) { Write-Output 'PC connection launcher is already running.'; exit 0 }
    $taskFailures = 0
    while ($taskFailures -lt 5) {
        foreach ($taskLogName in @('assistant-worker.log', 'assistant-worker-error.log')) {
            $taskLog = Join-Path $taskState $taskLogName
            if ((Test-Path -LiteralPath $taskLog) -and (Get-Item -LiteralPath $taskLog).Length -gt 2MB) {
                Move-Item -LiteralPath $taskLog -Destination ($taskLog + '.previous') -Force
            }
        }
        $taskArguments = @((Quote-TaskPath $taskTsx), (Quote-TaskPath $WorkerScript), 'worker')
        $taskStartTime = Get-Date
        $taskChild = Start-Process -FilePath $NodeExe -ArgumentList $taskArguments -WorkingDirectory $taskRepo -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskState 'assistant-worker.log') -RedirectStandardError (Join-Path $taskState 'assistant-worker-error.log') -PassThru -Wait
        # A normal exit includes deliberate device disconnection. Never silently re-pair it.
        if ($taskChild.ExitCode -eq 0) { break }
        if (((Get-Date) - $taskStartTime).TotalMinutes -gt 10) { $taskFailures = 0 }
        $taskFailures++
        if ($taskFailures -lt 5) { Start-Sleep -Seconds $RestartDelaySeconds }
    }
} finally {
    if ($taskAcquired) { $taskMutex.ReleaseMutex() }
    $taskMutex.Dispose()
}
