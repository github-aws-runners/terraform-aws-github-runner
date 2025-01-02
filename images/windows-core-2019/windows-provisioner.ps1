# Set up preferences for output
$ErrorActionPreference = "Continue"
$VerbosePreference = "Continue"
$ProgressPreference = "SilentlyContinue"

# Print out our powershell version just so we know what the default is.
$PSVersionTable

# Just checking disk space
Get-PSDrive C | Select-Object Used,Free

# Make sure that we have a profile to set and write to. If not, create it.
$powershellProfile = "C:\Users\Administrator\Documents\WindowsPowerShell\profile.ps1"
Write-Output "Checking for profile at $powershellProfile"
if (!(Test-Path -Path $powershellProfile)) {
  Write-Output "Creating $powershellProfile cause it doesn't exist yet"
  New-Item -Type File -Path $powershellProfile -Force
}
Write-Output "Checking for profile at $profile"
if (!(Test-Path -Path $profile)) {
  Write-Output "Creating $profile cause it doesn't exist yet"
  New-Item -Type File -Path $profile -Force
}

# Install Chocolatey
Write-Output "Setting up Chocolatey install execution policy"
Get-ExecutionPolicy
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
Write-Output "Downloading and running Chocolatey install script"
# NOTE : We use the System.Net.WebClient object, because using Invoke-Webrequest is ridiculously slow with larger files. Using this halves download times.
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
choco feature enable -n allowGlobalConfirmation

# NOTE / IMPORTANT : DO NOT SET THE POWERSHELL PROFILE. FOR SOME REASON IT BREAKS THE SFTP PROVISIONER.
# Likely due to the fact that the powershell profile will generate output when it is sourced, which causes
# a "Error processing command: Error uploading ps script containing env vars: sftpSession error: packet too long" 
# failure when trying to upload the next script.

# Install cloudwatch agent
Write-Output "Installing cloudwatch agent..."
$cloudwatchURL = "https://s3.amazonaws.com/amazoncloudwatch-agent/windows/amd64/latest/amazon-cloudwatch-agent.msi"
$cloudwatchLocation = "C:\amazon-cloudwatch-agent.msi"
$cloudwatchParams = '/i', 'C:\amazon-cloudwatch-agent.msi', '/qn', '/L*v', 'C:\CloudwatchInstall.log'
$webClient = New-Object System.Net.WebClient
$webClient.Downloadfile($cloudwatchURL, $cloudwatchLocation)
Write-Output "Installing Cloudwatch agent from $cloudwatchLocation"
Start-Process "msiexec.exe" -ArgumentList $cloudwatchParams -Wait -NoNewWindow
Remove-Item $cloudwatchLocation

# Install dependent tools
Write-Output "Installing additional development tools"
choco install git awscli -y
refreshenv

# Install Github Actions runner
Write-Output "Creating actions-runner directory for the GH Action installtion"
New-Item -ItemType Directory -Path C:\actions-runner ; Set-Location C:\actions-runner
Write-Output "Downloading the GH Action runner from ${action_runner_url}"
# Invoke-WebRequest -Uri ${action_runner_url} -OutFile actions-runner.zip
$webClient.Downloadfile("${action_runner_url}", "$PWD\actions-runner.zip")
Write-Output "Unzip action runner"
Expand-Archive -Path actions-runner.zip -DestinationPath .
Write-Output "Delete zip file"
Remove-Item actions-runner.zip

$action = New-ScheduledTaskAction -WorkingDirectory "C:\actions-runner" -Execute "PowerShell.exe" -Argument "-File C:\start-runner.ps1"
$trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName "runnerinit" -Action $action -Trigger $trigger -User System -RunLevel Highest -Force

# TODO : The line below failed on my instances. I removed it, and everything works just fine. Something is funky here.
C:\ProgramData\Amazon\EC2-Windows\Launch\Scripts\InitializeInstance.ps1 -Schedule
Write-Output "Finished running windows provisioner."
