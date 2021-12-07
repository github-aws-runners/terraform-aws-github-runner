Write-Host "Installing GitHub Actions runner..."
New-Item -ItemType Directory -Path C:\actions-runner ; Set-Location C:\actions-runner

aws s3 cp ${S3_LOCATION_RUNNER_DISTRIBUTION} actions-runner.zip
arc -folder-safe=false unarchive actions-runner.zip
Remove-Item actions-runner.zip


Write-Host  "Retrieving TOKEN from AWS API"
$token=Invoke-RestMethod -Method PUT -Uri "http://169.254.169.254/latest/api/token" -Headers @{"X-aws-ec2-metadata-token-ttl-seconds" = "180"}

$metadata=Invoke-RestMethod -Uri "http://169.254.169.254/latest/dynamic/instance-identity/document" -Headers @{"X-aws-ec2-metadata-token" = $token} | ConvertFrom-Json

$Region = $metadata.region
Write-Host  "Reteieved REGION from AWS API ($Region)"

$InstanceId = $metadata.instanceId
Write-Host  "Reteieved InstanceId from AWS API ($InstanceId)"

$tags=$(aws ec2 describe-tags --region "$Region" --filters "Name=resource-id,Values=$InstanceId") | ConvertFrom-Json
Write-Host  "Retrieved tags from AWS API ($tags)"

$environment=$tags.Tags.where( {$_.Key -eq 'ghr:environment'}).value
Write-Host  "Reteieved ghr:environment tag - ($environment)"




$parameters=$(aws ssm get-parameters-by-path --path "/$environment/runner" --region "$Region" --query "Parameters[*].{Name:Name,Value:Value}") | ConvertFrom-Json
Write-Host  "Retrieved parameters from AWS SSM ($parameters)"

$run_as=$parameters.where( {$_.Name -eq "/$environment/runner/run-as"}).value
Write-Host  "Retrieved /$environment/runner/run-as parameter - ($run_as)"

$enable_cloudwatch_agent=$parameters.where( {$_.Name -eq "/$environment/runner/enable-cloudwatch"}).value
Write-Host  "Retrieved /$environment/runner/enable-cloudwatch parameter - ($enable_cloudwatch_agent)"

$agent_mode=$parameters.where( {$_.Name -eq "/$environment/runner/agent-mode"}).value
Write-Host  "Retrieved /$environment/runner/agent-mode parameter - ($agent_mode)"





Write-Host "Waiting for configuration..."

$config = "null"
$i = 0
do {
    $config = aws ssm get-parameters --names "$environment-$InstanceId" --with-decryption --region $Region | jq -r ".Parameters | .[0] | .Value"
    Write-Host "Waiting for configuration... ($i/30)"
    Start-Sleep 1
    $i++
} while (($config -eq "null") -and ($i -lt 30))

aws ssm delete-parameter --name "$environment-$InstanceId" --region $Region

# Create or update user
Add-Type -AssemblyName "System.Web"
$password = [System.Web.Security.Membership]::GeneratePassword(24, 4)
$securePassword = ConvertTo-SecureString $password -AsPlainText -Force
$username = "runneruser"
if (!(Get-LocalUser -Name $username -ErrorAction Ignore)) {
    New-LocalUser -Name $username -Password $securePassword
    Write-Host "Created $username"
}
else {
    Set-LocalUser -Name $username -Password $securePassword
    Write-Host "Changed password for $username"
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
# TODO investigate if this is needed or if its overkill
Set-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System -Name ConsentPromptBehaviorAdmin -Value 0 -Force
Write-Host "Disabled User Access Control (UAC)"

$configCmd = ".\config.cmd --unattended --name $InstanceId --work `"_work`" $config"
Write-Host "Invoking config command..."
Invoke-Expression $configCmd

Write-Host "Scheduling runner daemon to run as runneruser..."

$action = New-ScheduledTaskAction -WorkingDirectory "$pwd" -Execute "run.cmd"
$trigger = Get-CimClass "MSFT_TaskRegistrationTrigger" -Namespace "Root/Microsoft/Windows/TaskScheduler"
Register-ScheduledTask -TaskName "runnertask" -Action $action -Trigger $trigger -User $username -Password $password -RunLevel Highest -Force
