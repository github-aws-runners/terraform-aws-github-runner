# ghr:start-runner:begin

## Retrieve instance metadata

$bootHookDir = "C:\ProgramData\ghr"
$bootHookScript = "$bootHookDir\start-runner.ps1"
$bootHookTask = "ghr-start-runner"
# An activated warm spot instance keeps its persistent spot request until it cancels the request itself.
$spotDetachDelaySeconds = 60
$spotDetachMarker = Join-Path $bootHookDir "spot-request-cancelled"
$spotDetach = $null

function Test-ActivatedSpot {
    return [bool]$warm_activated -and ($instance_life_cycle -eq "spot")
}

# Shared with the background job, which runs in its own process.
$cancelSpotRequest = {
    param($SpotRequestId, $Region, $Marker, $BootTime)
    if (-not $SpotRequestId) {
        Write-Host "warm-pool-spot-request-cancel-failed reason=missing-request-id"
        return $false
    }
    $reason = "unknown"
    foreach ($attempt in 1..3) {
        $result = aws ec2 cancel-spot-instance-requests --spot-instance-request-ids $SpotRequestId --region $Region 2>&1
        if ($LASTEXITCODE -eq 0) {
            New-Item -ItemType Directory -Path (Split-Path $Marker) -Force | Out-Null
            New-Item -ItemType File -Path $Marker -Force | Out-Null
            Write-Host "warm-pool-spot-request-cancelled seconds-after-boot=$([int]((Get-Date) - $BootTime).TotalSeconds)"
            return $true
        }
        if ("$result" -match '\(([A-Za-z.]+)\)') { $reason = $Matches[1] }
        if ($reason -eq "InvalidSpotInstanceRequestID.NotFound") { return $true }
        Start-Sleep -Seconds ($attempt * 2)
    }
    Write-Host "warm-pool-spot-request-cancel-failed reason=$reason"
    return $false
}

$spotDetachJob = {
    param($SpotRequestId, $Region, $Marker, $BootTime, $WaitSeconds, $CancelSpotRequest)
    if ($WaitSeconds -gt 0) { Start-Sleep -Seconds $WaitSeconds }
    if (-not (& ([scriptblock]::Create($CancelSpotRequest)) $SpotRequestId $Region $Marker $BootTime)) { return }
    # A terminate notice right after the cancel means the request was cancelled while still disabled.
    foreach ($i in 1..6) {
        Start-Sleep -Seconds 5
        try {
            $imdsToken = Invoke-RestMethod -Method PUT -Uri "http://169.254.169.254/latest/api/token" -Headers @{"X-aws-ec2-metadata-token-ttl-seconds" = "60"} -TimeoutSec 2
            $action = Invoke-RestMethod -Uri "http://169.254.169.254/latest/meta-data/spot/instance-action" -Headers @{"X-aws-ec2-metadata-token" = $imdsToken} -TimeoutSec 2
            if ($action) {
                Write-Host "ERROR: warm-pool-spot-request-cancel-interrupted instance-action=$($action | ConvertTo-Json -Compress)"
                return
            }
        }
        catch { }
    }
}

function Start-SpotDetach {
    if (-not (Test-ActivatedSpot) -or -not $spot_request_id) { return }
    $waitSeconds = $spotDetachDelaySeconds - [int]((Get-Date) - $bootTime).TotalSeconds
    $script:spotDetach = Start-Job -ScriptBlock $spotDetachJob -ArgumentList $spot_request_id, $Region, $spotDetachMarker, $bootTime, $waitSeconds, $cancelSpotRequest.ToString()
}

# Cancelling right before terminating is safe in any request state; terminating with a live request respawns the instance.
function Confirm-SpotRequestCancelled {
    if ($spotDetach) { Receive-Job $spotDetach -ErrorAction SilentlyContinue }
    if (Test-Path $spotDetachMarker) { return $true }
    if ($spotDetach) {
        Stop-Job $spotDetach -ErrorAction SilentlyContinue
        Receive-Job $spotDetach -ErrorAction SilentlyContinue
    }
    if (Test-Path $spotDetachMarker) { return $true }
    return [bool](& $cancelSpotRequest $spot_request_id $Region $spotDetachMarker $bootTime)
}

function Test-WarmStandby {
    return ($warm_pool -eq "true") -and (-not $warm_activated)
}

function Get-BootMode {
    aws ssm get-parameter --name "$token_path/$InstanceId" --region "$Region" *> $null
    if ($LASTEXITCODE -eq 0) { return "RUN" }
    if (Test-WarmStandby) { return "PRIME" }
    return "WAIT"
}

function Write-WarmActivationLatency {
    if (-not $warm_activated) { return }
    try {
        $activated = [DateTimeOffset]::Parse($warm_activated, [Globalization.CultureInfo]::InvariantCulture)
        Write-Host "warm-pool-activation-latency-seconds=$([int]([DateTimeOffset]::UtcNow - $activated).TotalSeconds)"
    }
    catch {
        Write-Host "Warning: could not parse ghr:warm-activated ($warm_activated)"
    }
}

# EC2Launch runs user data on first boot only, so warm instances rerun this script from a startup task.
function Install-BootHook {
    $imdsToken = Invoke-RestMethod -Method PUT -Uri "http://169.254.169.254/latest/api/token" -Headers @{"X-aws-ec2-metadata-token-ttl-seconds" = "60"}
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://169.254.169.254/latest/user-data" -Headers @{"X-aws-ec2-metadata-token" = $imdsToken}
    $lines = [System.Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray()) -split "`r?`n"
    $begin = [Array]::IndexOf($lines, "# ghr:start-runner:begin")
    $end = [Array]::IndexOf($lines, "# ghr:start-runner:end")
    if ($begin -lt 0 -or $end -le $begin) {
        Write-Host "Failed to extract the start script from user data"
        return $false
    }
    # User data runs with ErrorActionPreference Continue; a partial hook must not let the instance park.
    try {
        New-Item -ItemType Directory -Path $bootHookDir -Force -ErrorAction Stop | Out-Null
        $lines[$begin..$end] | Set-Content -Path $bootHookScript -Encoding UTF8 -ErrorAction Stop

        $action = New-ScheduledTaskAction -Execute "powershell.exe" -WorkingDirectory "$pwd" -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"Start-Transcript -Path C:\UserData.log -Append; & '$bootHookScript'; Stop-Transcript`"" -ErrorAction Stop
        $trigger = New-ScheduledTaskTrigger -AtStartup -ErrorAction Stop
        $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -ErrorAction Stop
        Register-ScheduledTask -TaskName $bootHookTask -Action $action -Trigger $trigger -Settings $settings -User "SYSTEM" -RunLevel Highest -Force -ErrorAction Stop | Out-Null
    }
    catch {
        Write-Host "Failed to install the boot hook: $($_.Exception.Message)"
        return $false
    }
    return [bool](Get-ScheduledTask -TaskName $bootHookTask -ErrorAction Ignore)
}

function Tag-InstanceWithRunnerId {
    Write-Host "Checking for .runner file to extract agent ID"

    $runnerFilePath = "$pwd\.runner"
    if (-not (Test-Path $runnerFilePath)) {
        Write-Host "Warning: .runner file not found"
        return $true
    }

    Write-Host "Found .runner file, extracting agent ID"
    try {
        $runnerConfig = Get-Content $runnerFilePath | ConvertFrom-Json
        $agentId = $runnerConfig.agentId

        if (-not $agentId -or $agentId -eq $null) {
            Write-Host "Warning: Could not extract agent ID from .runner file"
            return $true
        }

        Write-Host "Tagging instance with GitHub runner agent ID: $agentId"
        $tagResult = aws ec2 create-tags --region "$Region" --resources "$InstanceId" --tags "Key=ghr:github_runner_id,Value=$agentId" 2>&1

        if ($LASTEXITCODE -eq 0) {
            Write-Host "Successfully tagged instance with agent ID: $agentId"
            return $true
        } else {
            Write-Host "Warning: Failed to tag instance with agent ID - $tagResult"
            return $true
        }
    }
    catch {
        Write-Host "Warning: Error processing .runner file - $($_.Exception.Message)"
        return $true
    }
}

## Retrieve instance metadata

Write-Host  "Retrieving TOKEN from AWS API"
$token=Invoke-RestMethod -Method PUT -Uri "http://169.254.169.254/latest/api/token" -Headers @{"X-aws-ec2-metadata-token-ttl-seconds" = "180"}
if ( ! $token ) {
  $retrycount=0
  do {
    echo "Failed to retrieve token. Retrying in 5 seconds."
    Start-Sleep 5
    $token=Invoke-RestMethod -Method PUT -Uri "http://169.254.169.254/latest/api/token" -Headers @{"X-aws-ec2-metadata-token-ttl-seconds" = "180"}
    $retrycount=$retrycount + 1
    if ( $retrycount -gt 40 )
    {
        break
    }
  } until ($token)
}

$ami_id=Invoke-RestMethod -Uri "http://169.254.169.254/latest/meta-data/ami-id" -Headers @{"X-aws-ec2-metadata-token" = $token}

$metadata=Invoke-RestMethod -Uri "http://169.254.169.254/latest/dynamic/instance-identity/document" -Headers @{"X-aws-ec2-metadata-token" = $token}

$Region = $metadata.region
Write-Host  "Retrieved REGION from AWS API ($Region)"

$InstanceId = $metadata.instanceId
Write-Host  "Retrieved InstanceId from AWS API ($InstanceId)"

try {
    $instance_life_cycle = Invoke-RestMethod -Uri "http://169.254.169.254/latest/meta-data/instance-life-cycle" -Headers @{"X-aws-ec2-metadata-token" = $token}
}
catch {
    $instance_life_cycle = ""
}

$tags=aws ec2 describe-tags --region "$Region" --filters "Name=resource-id,Values=$InstanceId" | ConvertFrom-Json
Write-Host  "Retrieved tags from AWS API"

$environment=$tags.Tags.where( {$_.Key -eq 'ghr:environment'}).value
Write-Host  "Retrieved ghr:environment tag - ($environment)"

$runner_name_prefix=$tags.Tags.where( {$_.Key -eq 'ghr:runner_name_prefix'}).value
Write-Host  "Retrieved ghr:runner_name_prefix tag - ($runner_name_prefix)"

$ssm_config_path=$tags.Tags.where( {$_.Key -eq 'ghr:ssm_config_path'}).value
Write-Host  "Retrieved ghr:ssm_config_path tag - ($ssm_config_path)"

$warm_pool=$tags.Tags.where( {$_.Key -eq 'ghr:warm-pool'}).value
$warm_activated=$tags.Tags.where( {$_.Key -eq 'ghr:warm-activated'}).value
$spot_request_id=$tags.Tags.where( {$_.Key -eq 'ghr:spot-request-id'}).value
Write-Host  "Retrieved ghr:warm-pool tag - ($warm_pool), ghr:warm-activated tag - ($warm_activated)"

$parameters=$(aws ssm get-parameters-by-path --path "$ssm_config_path" --region "$Region" --query "Parameters[*].{Name:Name,Value:Value}") | ConvertFrom-Json
Write-Host  "Retrieved parameters from AWS SSM"

$run_as=$parameters.where( {$_.Name -eq "$ssm_config_path/run_as"}).value
Write-Host  "Retrieved $ssm_config_path/run_as parameter - ($run_as)"

$enable_cloudwatch_agent=$parameters.where( {$_.Name -eq "$ssm_config_path/enable_cloudwatch"}).value
Write-Host  "Retrieved $ssm_config_path/enable_cloudwatch parameter - ($enable_cloudwatch_agent)"

$agent_mode=$parameters.where( {$_.Name -eq "$ssm_config_path/agent_mode"}).value
Write-Host  "Retrieved $ssm_config_path/agent_mode parameter - ($agent_mode)"

$disable_default_labels=$parameters.where( {$_.Name -eq "$ssm_config_path/disable_default_labels"}).value
Write-Host  "Retrieved $ssm_config_path/disable_default_labels parameter - ($disable_default_labels)"

$enable_jit_config=$parameters.where( {$_.Name -eq "$ssm_config_path/enable_jit_config"}).value
Write-Host  "Retrieved $ssm_config_path/enable_jit_config parameter - ($enable_jit_config)"

$token_path=$parameters.where( {$_.Name -eq "$ssm_config_path/token_path"}).value
Write-Host  "Retrieved $ssm_config_path/token_path parameter - ($token_path)"

$boot_mode = Get-BootMode
Write-Host "Selected boot mode: $boot_mode"
# An activated warm instance is single use; later reboots must not rerun the start logic.
if ($boot_mode -ne "PRIME" -and (Get-ScheduledTask -TaskName $bootHookTask -ErrorAction Ignore)) {
    Disable-ScheduledTask -TaskName $bootHookTask | Out-Null
}
$bootTime = (gcim Win32_OperatingSystem).LastBootUpTime
if ($boot_mode -ne "PRIME") {
    Start-SpotDetach
}

if ($enable_cloudwatch_agent -eq "true")
{
    Write-Host  "Enabling CloudWatch Agent"
    & 'C:\Program Files\Amazon\AmazonCloudWatchAgent\amazon-cloudwatch-agent-ctl.ps1' -a fetch-config -m ec2 -s -c "ssm:$ssm_config_path/cloudwatch_agent_config_runner"
}

if ($boot_mode -eq "PRIME") {
    if (-not (Install-BootHook)) { exit 1 }
    Write-Host "Warm pool instance primed, shutting down"
    # Delayed so EC2Launch records user data as completed before the instance stops.
    shutdown.exe /s /t 60 /f
    exit 0
}

## Configure the runner

Write-Host "Get GH Runner config from AWS SSM"
$config = $null
$i = 0
do {
    $config = (aws ssm get-parameters --names "$token_path/$InstanceId" --with-decryption --region $Region  --query "Parameters[*].{Name:Name,Value:Value}" | ConvertFrom-Json)[0].value
    Write-Host "Waiting for GH Runner config to become available in AWS SSM ($i/30)"
    Start-Sleep 1
    $i++
} while (($null -eq $config) -and ($i -lt 30))

Write-Host "Delete GH Runner token from AWS SSM"
aws ssm delete-parameter --name "$token_path/$InstanceId" --region $Region

# Create or update user
if (-not($run_as)) {
  Write-Host "No user specified, using default ec2-user account"
  $run_as="ec2-user"
}
Add-Type -AssemblyName "System.Web"
$password = [System.Web.Security.Membership]::GeneratePassword(24, 4)
$securePassword = ConvertTo-SecureString $password -AsPlainText -Force
$username = $run_as
if (!(Get-LocalUser -Name $username -ErrorAction Ignore)) {
    New-LocalUser -Name $username -Password $securePassword
    Write-Host "Created new user ($username)"
}
else {
    Set-LocalUser -Name $username -Password $securePassword
    Write-Host "Changed password for user ($username)"
}
# Add user to groups
foreach ($group in @("Administrators", "docker-users")) {
    if ((Get-LocalGroup -Name "$group" -ErrorAction Ignore) -and
        !(Get-LocalGroupMember -Group "$group" -Member $username -ErrorAction Ignore)) {
        Add-LocalGroupMember -Group "$group" -Member $username
        Write-Host "Added $username to $group group"
    }
}

# Disable User Access Control (UAC)
# TODO investigate if this is needed or if its overkill - https://github.com/github-aws-runners/terraform-aws-github-runner/issues/1505
Set-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System -Name ConsentPromptBehaviorAdmin -Value 0 -Force
Write-Host "Disabled User Access Control (UAC)"

$runnerExtraOptions = ""
if ($disable_default_labels -eq "true") {
    $runnerExtraOptions += "--no-default-labels"
}

if ($enable_jit_config -eq "false" -or $agent_mode -ne "ephemeral") {
  $configCmd = ".\config.cmd --unattended --name $runner_name_prefix$InstanceId --work `"_work`" $runnerExtraOptions $config"
  Write-Host "Configure GH Runner (non ephmeral / no JIT) as user $run_as"
  Invoke-Expression $configCmd

  # Tag instance with GitHub runner agent ID for non-JIT runners
  Tag-InstanceWithRunnerId
}

$jsonBody = @(
    @{
        group='Runner Image'
        detail="AMI id: $ami_id"
    }
)
ConvertTo-Json -InputObject $jsonBody | Set-Content -Path "$pwd\.setup_info"


Write-WarmActivationLatency
Write-Host "Starting the runner in $agent_mode mode"
Write-Host "Starting runner after $(((get-date) - (gcim Win32_OperatingSystem).LastBootUpTime).tostring("hh':'mm':'ss''"))"

if ($agent_mode -eq "ephemeral") {
    if ($enable_jit_config -eq "true") {
        Write-Host "Starting with jit config"
        Invoke-Expression ".\run.cmd --jitconfig $${config}"
    }
    else {
        Write-Host "Starting without jit config"
        Invoke-Expression ".\run.cmd"
    }
    Write-Host "Runner has finished"

    $spotCancelFailed = (Test-ActivatedSpot) -and -not (Confirm-SpotRequestCancelled)

    if ($enable_cloudwatch_agent)
    {
        Write-Host "Stopping CloudWatch Agent"
        & 'C:\Program Files\Amazon\AmazonCloudWatchAgent\amazon-cloudwatch-agent-ctl.ps1' -a stop
    }

    if ($spotCancelFailed) {
        Write-Host "Shutting down instead of terminating, so the live spot request cannot launch a replacement"
        shutdown.exe /s /t 0 /f
    }
    else {
        Write-Host "Terminating instance"
        aws ec2 terminate-instances --instance-ids "$InstanceId" --region "$Region"
    }
} else {
    Write-Host  "Installing the runner as a service"

    $action = New-ScheduledTaskAction -WorkingDirectory "$pwd" -Execute "run.cmd"
    $trigger = Get-CimClass "MSFT_TaskRegistrationTrigger" -Namespace "Root/Microsoft/Windows/TaskScheduler"
    Register-ScheduledTask -TaskName "runnertask" -Action $action -Trigger $trigger -User $username -Password $password -RunLevel Highest -Force
    Write-Host "Starting runner after $(((get-date) - (gcim Win32_OperatingSystem).LastBootUpTime).tostring("hh':'mm':'ss''"))"
    # The job ends with this script, so wait for the detach of a persistent runner.
    if ($spotDetach) {
        Wait-Job $spotDetach -Timeout 180 | Out-Null
        Receive-Job $spotDetach -ErrorAction SilentlyContinue
    }
}
# ghr:start-runner:end
