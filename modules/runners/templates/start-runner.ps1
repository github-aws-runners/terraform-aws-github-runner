
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
# TODO investigate if this is needed or if its overkill - https://github.com/philips-labs/terraform-aws-github-runner/issues/1505
Set-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System -Name ConsentPromptBehaviorAdmin -Value 0 -Force
Write-Host "Disabled User Access Control (UAC)"

$configCmd = ".\config.cmd --unattended --name $runner_name_prefix$InstanceId --work `"_work`" $config"
Write-Host "Configure GH Runner as user $run_as"
Invoke-Expression $configCmd

Write-Host "Starting the runner as user $run_as"

$jsonBody = @(
    @{
        group='Runner Image'
        detail="AMI id: $ami_id"
    }
)
ConvertTo-Json -InputObject $jsonBody | Set-Content -Path "$pwd\.setup_info"

Write-Host  "Installing the runner as a service"

$action = New-ScheduledTaskAction -WorkingDirectory "$pwd" -Execute "run.cmd"
$trigger = Get-CimClass "MSFT_TaskRegistrationTrigger" -Namespace "Root/Microsoft/Windows/TaskScheduler"
Register-ScheduledTask -TaskName "runnertask" -Action $action -Trigger $trigger -User $username -Password $password -RunLevel Highest -Force
Write-Host "Starting the runner in persistent mode"
Write-Host "Starting runner after $(((get-date) - (gcim Win32_OperatingSystem).LastBootUpTime).tostring("hh':'mm':'ss''"))"
