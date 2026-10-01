# Boot-mode tests for templates/start-runner.ps1. Runs locally with pwsh and without AWS: IMDS, aws and
# Windows-only cmdlets are mocked, absolute paths are rewritten into a per-test sandbox.
# Usage: pwsh -NoProfile -File modules/runners/templates/tests/start-runner.test.ps1 [path/to/start-runner.ps1]
param([string]$Template = (Join-Path $PSScriptRoot '../start-runner.ps1'))

$ErrorActionPreference = 'Stop'
$v2Template = Join-Path $PSScriptRoot '../../../compute-providers/aws/ec2/templates/start-runner.ps1'
$instanceId = 'i-0123456789abcdef0'
$script:pass = 0
$script:fail = 0

$prelude = @'
$ErrorActionPreference = 'Continue'
$sandbox = $env:SANDBOX
function Log([string]$line) { Add-Content -Path "$sandbox/calls.log" -Value $line }
function Start-Sleep { }
function Add-Type { }
function Set-ItemProperty { }
function Get-LocalUser { $null }
function New-LocalUser { Log "New-LocalUser $args" }
function Set-LocalUser { }
function Get-LocalGroup { $null }
function gcim { [pscustomobject]@{ LastBootUpTime = (Get-Date) } }
function shutdown.exe { Log "shutdown.exe $args" }
function run-cmd { Log "run.cmd $args" }
function config-cmd { Log "config.cmd $args" }
function New-ScheduledTaskAction { [CmdletBinding()] param($Execute, $WorkingDirectory, $Argument) [pscustomobject]@{ Execute = $Execute; Argument = $Argument } }
function New-ScheduledTaskTrigger { [CmdletBinding()] param([switch]$AtStartup) [pscustomobject]@{ AtStartup = [bool]$AtStartup } }
function New-ScheduledTaskSettingsSet { [CmdletBinding()] param($ExecutionTimeLimit) [pscustomobject]@{ ExecutionTimeLimit = $ExecutionTimeLimit } }
function Register-ScheduledTask {
    [CmdletBinding()]
    param($TaskName, $Action, $Trigger, $Settings, $User, $Password, $RunLevel, [switch]$Force)
    if ($env:REGISTER_FAIL) { Write-Error 'Access is denied.'; return }
    Log "Register-ScheduledTask $TaskName user=$User atStartup=$($Trigger.AtStartup) limit=$($Settings.ExecutionTimeLimit) execute=$($Action.Execute) argument=$($Action.Argument)"
    Set-Content -Path "$sandbox/task-$TaskName" -Value 'registered'
}
function Get-ScheduledTask { param($TaskName, $ErrorAction) if (Test-Path "$sandbox/task-$TaskName") { [pscustomobject]@{ TaskName = $TaskName } } }
function Disable-ScheduledTask { param($TaskName) Log "Disable-ScheduledTask $TaskName" }
function Invoke-RestMethod {
    param($Method, $Uri, $Headers)
    switch -Wildcard ($Uri) {
        '*/latest/api/token' { 'imds-token' }
        '*/meta-data/ami-id' { 'ami-0123' }
        '*/dynamic/instance-identity/document' { [pscustomobject]@{ region = 'eu-west-1'; instanceId = $env:INSTANCE_ID } }
        default { throw "unexpected IMDS call $Uri" }
    }
}
function Invoke-WebRequest {
    param($Uri, $Headers, [switch]$UseBasicParsing)
    Log "Invoke-WebRequest $Uri"
    [pscustomobject]@{ RawContentStream = [IO.MemoryStream]::new([IO.File]::ReadAllBytes("$sandbox/user-data")) }
}
function aws {
    Log "aws $args"
    $global:LASTEXITCODE = 0
    $hasConfig = Test-Path "$sandbox/runner-config"
    switch ("$($args[0]) $($args[1])") {
        'ec2 describe-tags' { Get-Content "$sandbox/tags.json" -Raw }
        'ssm get-parameters-by-path' { Get-Content "$sandbox/ssm-config.json" -Raw }
        'ssm get-parameter' { if ($hasConfig) { '{"Parameter":{"Value":"jit-config-blob"}}' } else { $global:LASTEXITCODE = 254 } }
        'ssm get-parameters' {
            $polls = [int](Get-Content "$sandbox/polls" -ErrorAction SilentlyContinue) + 1
            Set-Content "$sandbox/polls" $polls
            if ($env:CONFIG_AFTER -and $polls -ge [int]$env:CONFIG_AFTER) { Set-Content "$sandbox/runner-config" 'x'; $hasConfig = $true }
            if ($hasConfig) { '[{"Name":"config","Value":"jit-config-blob"}]' } else { '[]' }
        }
        default { }
    }
}
'@

function Render([string]$path) {
    (Get-Content $path -Raw).Replace('$${', '${').Replace('.\run.cmd', 'run-cmd').Replace('.\config.cmd', 'config-cmd').Replace('C:\ProgramData\ghr', "$env:SANDBOX/ProgramData/ghr").Replace('$bootHookDir\start-runner.ps1', '$bootHookDir/start-runner.ps1')
}

function New-Sandbox([hashtable]$Tags = @{}) {
    $env:SANDBOX = (New-Item -ItemType Directory -Path (Join-Path ([IO.Path]::GetTempPath()) "start-runner-ps1-test.$([guid]::NewGuid())")).FullName
    $env:INSTANCE_ID = $instanceId
    $env:CONFIG_AFTER = ''
    $env:REGISTER_FAIL = ''
    New-Item -ItemType Directory -Path "$env:SANDBOX/actions-runner" | Out-Null
    New-Item -ItemType File -Path "$env:SANDBOX/calls.log" | Out-Null
    $allTags = @{ 'ghr:environment' = 'test'; 'ghr:ssm_config_path' = '/ghr/config'; 'ghr:runner_name_prefix' = 'test-' } + $Tags
    @{ Tags = @($allTags.GetEnumerator() | ForEach-Object { @{ Key = $_.Key; Value = $_.Value } }) } | ConvertTo-Json -Depth 4 | Set-Content "$env:SANDBOX/tags.json"
    @(
        @{ Name = '/ghr/config/run_as'; Value = 'ec2-user' },
        @{ Name = '/ghr/config/enable_cloudwatch'; Value = 'false' },
        @{ Name = '/ghr/config/agent_mode'; Value = 'ephemeral' },
        @{ Name = '/ghr/config/disable_default_labels'; Value = 'false' },
        @{ Name = '/ghr/config/enable_jit_config'; Value = 'true' },
        @{ Name = '/ghr/config/token_path'; Value = '/ghr/tokens' }
    ) | ConvertTo-Json | Set-Content "$env:SANDBOX/ssm-config.json"
    Set-Content "$env:SANDBOX/prelude.ps1" $prelude
    $start = Render $Template
    Set-Content "$env:SANDBOX/start-runner.ps1" $start
    Set-Content "$env:SANDBOX/user-data" "<powershell>`n# user-data preamble`n$start`n# user-data epilogue`n</powershell>" -NoNewline
}

# Runs a script the way EC2Launch (first boot) or the startup task (later boots) does.
function Invoke-Boot([string]$scriptPath) {
    Set-Content "$env:SANDBOX/calls.log" ''
    Push-Location "$env:SANDBOX/actions-runner"
    try {
        $script:output = & pwsh -NoProfile -NonInteractive -Command ". '$env:SANDBOX/prelude.ps1'; . '$scriptPath'; exit `$LASTEXITCODE" 2>&1 | Out-String
        $script:exitCode = $LASTEXITCODE
    }
    finally { Pop-Location }
    $script:calls = Get-Content "$env:SANDBOX/calls.log" -Raw
}

function Check([string]$desc, [scriptblock]$condition) {
    if (& $condition) { $script:pass++; Write-Host "  ok   - $desc" }
    else { $script:fail++; Write-Host "  FAIL - $desc" }
}

function Called([string]$text) { $script:calls -and $script:calls.Contains($text) }
function ModeIs([string]$mode) { $script:output -match "(?m)^Selected boot mode: $mode\r?$" }
function ParseErrors([string]$path) {
    $errors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$null, [ref]$errors) | Out-Null
    $errors.Count
}

$hook = { "$env:SANDBOX/ProgramData/ghr/start-runner.ps1" }

Write-Host '# template syntax'
New-Sandbox
Check 'start-runner.ps1 parses (rendered)' { (ParseErrors "$env:SANDBOX/start-runner.ps1") -eq 0 }
Check 'no template directives left after render' { -not (Get-Content "$env:SANDBOX/start-runner.ps1" -Raw).Contains('%{') }
Check 'compute-providers/aws/ec2 start-runner.ps1 matches modules/runners' { (Get-FileHash (Join-Path $PSScriptRoot '../start-runner.ps1')).Hash -eq (Get-FileHash $v2Template).Hash }

Write-Host '# cold instance with registration config -> RUN'
New-Sandbox
Set-Content "$env:SANDBOX/runner-config" 'x'
Invoke-Boot "$env:SANDBOX/start-runner.ps1"
Check 'mode RUN' { ModeIs 'RUN' }
Check 'checks config parameter <token_path>/<instance-id>' { Called "aws ssm get-parameter --name /ghr/tokens/$instanceId " }
Check 'runs with JIT config' { Called 'run.cmd --jitconfig jit-config-blob' }
Check 'deletes config parameter' { Called "aws ssm delete-parameter --name /ghr/tokens/$instanceId" }
Check 'ephemeral self-terminates' { Called 'aws ec2 terminate-instances' }
Check 'no shutdown' { -not (Called 'shutdown.exe') }
Check 'no activation latency for cold instances' { -not $script:output.Contains('warm-pool-activation-latency') }
Check 'no boot hook installed' { -not (Called 'Register-ScheduledTask ghr-start-runner') }

Write-Host '# cold instance, config arrives later -> WAIT'
New-Sandbox
$env:CONFIG_AFTER = '3'
Invoke-Boot "$env:SANDBOX/start-runner.ps1"
Check 'mode WAIT' { ModeIs 'WAIT' }
Check 'polls for config' { $script:output.Contains('Waiting for GH Runner config') }
Check 'runs with JIT config' { Called 'run.cmd --jitconfig jit-config-blob' }
Check 'ephemeral self-terminates' { Called 'aws ec2 terminate-instances' }
Check 'no boot hook installed' { -not (Called 'Register-ScheduledTask ghr-start-runner') }

Write-Host '# warm standby first boot -> PRIME'
New-Sandbox @{ 'ghr:warm-pool' = 'true' }
Invoke-Boot "$env:SANDBOX/start-runner.ps1"
Check 'mode PRIME' { ModeIs 'PRIME' }
Check 'exits zero' { $script:exitCode -eq 0 }
Check 'schedules a shutdown' { Called 'shutdown.exe /s /t 60 /f' }
Check 'no terminate-instances' { -not (Called 'terminate-instances') }
Check 'does not consume registration config' { -not (Called 'delete-parameter') }
Check 'does not register' { -not (Called 'run.cmd') -and -not (Called 'config.cmd') }
Check 'startup task registered as SYSTEM without time limit' { Called 'Register-ScheduledTask ghr-start-runner user=SYSTEM atStartup=True limit=00:00:00 execute=powershell.exe' }
Check 'startup task runs the extracted script' { Called "& '$(& $hook)'" }
Check 'extracted script starts at begin marker' { (Get-Content (& $hook) -TotalCount 1) -eq '# ghr:start-runner:begin' }
Check 'extracted script ends at end marker' { (Get-Content (& $hook) | Select-Object -Last 1) -eq '# ghr:start-runner:end' }
Check 'extracted script excludes surrounding user-data' { -not (Get-Content (& $hook) -Raw).Contains('user-data preamble') }
Check 'extracted script parses' { (ParseErrors (& $hook)) -eq 0 }

Write-Host '# activated warm instance, later boot from the startup task -> RUN'
$activated = [DateTimeOffset]::UtcNow.AddSeconds(-42).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
Set-Content "$env:SANDBOX/tags.json" (@{ Tags = @(
            @{ Key = 'ghr:environment'; Value = 'test' }, @{ Key = 'ghr:ssm_config_path'; Value = '/ghr/config' },
            @{ Key = 'ghr:warm-pool'; Value = 'true' }, @{ Key = 'ghr:warm-activated'; Value = $activated }) } | ConvertTo-Json -Depth 4)
Set-Content "$env:SANDBOX/runner-config" 'x'
Invoke-Boot (& $hook)
Check 'mode RUN' { ModeIs 'RUN' }
Check 'runs with JIT config' { Called 'run.cmd --jitconfig jit-config-blob' }
Check 'disables boot hook (single use)' { Called 'Disable-ScheduledTask ghr-start-runner' }
Check 'logs activation latency' { $script:output -match '(?m)^warm-pool-activation-latency-seconds=\d+\r?$' }
Check 'ephemeral self-terminates' { Called 'aws ec2 terminate-instances' }
Check 'no shutdown' { -not (Called 'shutdown.exe') }

Write-Host '# task registration fails -> PRIME fails without shutdown'
New-Sandbox @{ 'ghr:warm-pool' = 'true' }
$env:REGISTER_FAIL = '1'
Invoke-Boot "$env:SANDBOX/start-runner.ps1"
Check 'exits non-zero' { $script:exitCode -ne 0 }
Check 'no shutdown' { -not (Called 'shutdown.exe') }
Check 'reports the hook failure' { $script:output.Contains('Failed to install the boot hook') }

Write-Host '# user data without markers -> PRIME fails without shutdown'
New-Sandbox @{ 'ghr:warm-pool' = 'true' }
Set-Content "$env:SANDBOX/user-data" '<powershell>custom template without the start script</powershell>'
Invoke-Boot "$env:SANDBOX/start-runner.ps1"
Check 'exits non-zero' { $script:exitCode -ne 0 }
Check 'no shutdown' { -not (Called 'shutdown.exe') }
Check 'no startup task' { -not (Called 'Register-ScheduledTask') }

Write-Host ''
Write-Host "passed: $script:pass, failed: $script:fail"
exit ([int]($script:fail -gt 0))
