<powershell>
$ErrorActionPreference = "Continue"
$VerbosePreference = "Continue"
Start-Transcript -Path "C:\UserData.log" -Append

${pre_install}

# # Install Chocolatey
# [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
# $env:chocolateyUseWindowsCompression = 'true'
# Invoke-WebRequest https://chocolatey.org/install.ps1 -UseBasicParsing | Invoke-Expression

# Add Chocolatey to powershell profile
# $ChocoProfileValue = @'
# # $ChocolateyProfile = "$env:ChocolateyInstall\helpers\chocolateyProfile.psm1"
# # if (Test-Path($ChocolateyProfile)) {
# #   Import-Module "$ChocolateyProfile"
# # }

refreshenv
# '@
# # Write it to the $profile location
# Set-Content -Path "$PsHome\Microsoft.PowerShell_profile.ps1" -Value $ChocoProfileValue -Force
# # Source it
# . "$PsHome\Microsoft.PowerShell_profile.ps1"


refreshenv

Write-Host "Installing cloudwatch agent..."
Invoke-WebRequest -Uri https://s3.amazonaws.com/amazoncloudwatch-agent/windows/amd64/latest/amazon-cloudwatch-agent.msi -OutFile C:\amazon-cloudwatch-agent.msi
$cloudwatchParams = '/i', 'C:\amazon-cloudwatch-agent.msi', '/qn', '/L*v', 'C:\CloudwatchInstall.log'
Start-Process "msiexec.exe" $cloudwatchParams -Wait -NoNewWindow
Remove-Item C:\amazon-cloudwatch-agent.msi


# Install dependent tools
Write-Host "Installing additional development tools"
# Define the URL of the AWS CLI MSI installer
$installerUrl = "https://awscli.amazonaws.com/AWSCLIV2.msi"

# Define the path where the installer will be saved
$installerPath = "$env:TEMP\AWSCLIV2.msi"

# Download the installer
Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath

# Install the AWS CLI
Start-Process msiexec.exe -Wait -ArgumentList "/I $installerPath /quiet"

# Verify the installation
aws --version
refreshenv

${install_runner}
${post_install}
${start_runner}

Stop-Transcript
</powershell>
