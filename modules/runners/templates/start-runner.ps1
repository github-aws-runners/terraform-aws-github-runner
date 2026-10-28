
## Retrieve instance metadata

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

# Wait for instance profile credentials before the first AWS CLI call. On
# prebuilt AMIs the first call can race credential availability and fail with
# NoCredentials, leaving the instance unregistered but running (see #5517).
Write-Host "Waiting for instance profile credentials to become available"
$credentialWaitRetries = 0
$credentialsAvailable = $false
while ($true) {
    aws sts get-caller-identity --region "$Region" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $credentialsAvailable = $true
        break
}
    $credentialWaitRetries = $credentialWaitRetries + 1
    if ($credentialWaitRetries -ge 12) {
        break
}
    Write-Host "Instance profile credentials not available yet, retrying in 5 seconds ($credentialWaitRetries/12)"
    Start-Sleep 5
}
if ($credentialsAvailable) {
    Write-Host "Instance profile credentials available"
} else {
    Write-Host "WARNING: instance profile credentials still unavailable after 60 s; continuing anyway"
}

$tags=aws ec2 describe-tags --region "$Region" --filters "Name=resource-id,Values=$InstanceId" | ConvertFrom-Json
Write-Host  "Retrieved tags from AWS API"

$environment=$tags.Tags.where( {$_.Key -eq 'ghr:environment'}).value
Write-Host  "Retrieved ghr:environment tag - ($environment)"

$runner_name_prefix=$tags.Tags.where( {$_.Key -eq 'ghr:runner_name_prefix'}).value
Write-Host  "Retrieved ghr:runner_name_prefix tag - ($runner_name_prefix)"

$ssm_config_path=$tags.Tags.where( {$_.Key -eq 'ghr:ssm_config_path'}).value
Write-Host  "Retrieved ghr:ssm_config_path tag - ($ssm_config_path)"

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


if ($enable_cloudwatch_agent -eq "true")
{
    Write-Host  "Enabling CloudWatch Agent"
    & 'C:\Program Files\Amazon\AmazonCloudWatchAgent\amazon-cloudwatch-agent-ctl.ps1' -a fetch-config -m ec2 -s -c "ssm:$ssm_config_path/cloudwatch_agent_config_runner"
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
# The token parameter may briefly refuse deletion with AccessDenied right after
# the read (IAM propagation delay), so retry before giving up (see #5517).
$deleteRetryCount = 0
while ($true) {
    $deleteOutput = aws ssm delete-parameter --name "$token_path/$InstanceId" --region $Region 2>&1
    if ($LASTEXITCODE -eq 0) {
        break
    }
    if (($deleteOutput -match "AccessDenied") -and ($deleteRetryCount -lt 24)) {
        $deleteRetryCount = $deleteRetryCount + 1
        Write-Host "delete-parameter access denied, retrying in 5 seconds ($deleteRetryCount/24)"
        Start-Sleep 5
    } else {
        Write-Host "ERROR: failed to delete SSM parameter $token_path/$InstanceId"
        Write-Host "$deleteOutput"
        exit 1
    }
}

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

    if ($enable_cloudwatch_agent)
    {
        Write-Host "Stopping CloudWatch Agent"
        & 'C:\Program Files\Amazon\AmazonCloudWatchAgent\amazon-cloudwatch-agent-ctl.ps1' -a stop
    }

    Write-Host "Terminating instance"
    aws ec2 terminate-instances --instance-ids "$InstanceId" --region "$Region"
    if ($LASTEXITCODE -ne 0) {
        # terminate-instances fails when credentials are unavailable (see #5517);
        # the launch template sets instance_initiated_shutdown_behavior to
        # "terminate", so shutting down ends the instance without API calls.
        Write-Host "WARNING: terminate-instances failed; falling back to shutdown"
        Stop-Computer -Force
    }
} else {
    Write-Host  "Installing the runner as a service"

    $action = New-ScheduledTaskAction -WorkingDirectory "$pwd" -Execute "run.cmd"
    $trigger = Get-CimClass "MSFT_TaskRegistrationTrigger" -Namespace "Root/Microsoft/Windows/TaskScheduler"
    Register-ScheduledTask -TaskName "runnertask" -Action $action -Trigger $trigger -User $username -Password $password -RunLevel Highest -Force
    Write-Host "Starting runner after $(((get-date) - (gcim Win32_OperatingSystem).LastBootUpTime).tostring("hh':'mm':'ss''"))"
}
