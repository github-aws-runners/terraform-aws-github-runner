Write-Host "Installing GitHub Actions runner..."
New-Item -ItemType Directory -Path C:\actions-runner ; Set-Location C:\actions-runner

aws s3 cp ${S3_LOCATION_RUNNER_DISTRIBUTION} actions-runner.zip
arc -folder-safe=false unarchive actions-runner.zip
Remove-Item actions-runner.zip

$InstanceId = Get-EC2InstanceMetadata -Category InstanceId
$Region = Get-EC2InstanceMetadata -Category IdentityDocument | ConvertFrom-Json | Select-Object -ExpandProperty region

$tags = Get-EC2Tag -Filter @{Name="resource-type";Values="instance"},@{Name="resourceId";Values="$InstanceId"}
## TODO get environment from tags

Write-Host "Waiting for configuration..."

$config = "null"
$i = 0
do {
    $config = aws ssm get-parameters --names "${environment}-$InstanceId" --with-decryption --region $Region | jq -r ".Parameters | .[0] | .Value"
    Write-Host "Waiting for configuration... ($i/30)"
    Start-Sleep 1
    $i++
} while (($config -eq "null") -and ($i -lt 30))

aws ssm delete-parameter --name "${environment}-$InstanceId" --region $REGION

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
Set-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System -Name ConsentPromptBehaviorAdmin -Value 0 -Force
Write-Host "Disabled User Access Control (UAC)"

$configCmd = ".\config.cmd --unattended --name $InstanceId --work `"_work`" $config"
Write-Host "Invoking config command..."
Invoke-Expression $configCmd

Write-Host "Scheduling runner daemon to run as runneruser..."
$pwd = Get-Location
$action = New-ScheduledTaskAction -WorkingDirectory "$pwd" -Execute "run.cmd"
$trigger = Get-CimClass "MSFT_TaskRegistrationTrigger" -Namespace "Root/Microsoft/Windows/TaskScheduler"
Register-ScheduledTask -TaskName "runnertask" -Action $action -Trigger $trigger -User $username -Password $password -RunLevel Highest -Force
