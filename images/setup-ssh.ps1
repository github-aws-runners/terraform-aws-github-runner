<powershell>
# Credit to : https://github.com/chorrell/packer-aws-windows-openssh/blob/main/files/SetupSsh.ps1

# Don't display progress bars
# See: https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_preference_variables?view=powershell-7.3#progresspreference
$ProgressPreference = 'SilentlyContinue'
Set-ExecutionPolicy Unrestricted -Scope LocalMachine -Force -ErrorAction Ignore
# Don't set this before Set-ExecutionPolicy as it throws an error
$ErrorActionPreference = "stop"
# Install OpenSSH using Add-WindowsCapability
# See: https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse?tabs=powershell#install-openssh-for-windows

Write-Output 'Installing and starting ssh-agent'
Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0
Set-Service -Name ssh-agent -StartupType Automatic
Start-Service ssh-agent

Write-Output 'Installing and starting sshd'
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Set-Service -Name sshd -StartupType Automatic
Start-Service sshd

# Confirm the Firewall rule is configured. It should be created automatically by setup. Run the following to verify
if (!(Get-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -ErrorAction SilentlyContinue | Select-Object Name, Enabled)) {
    Write-Output "Firewall Rule 'OpenSSH-Server-In-TCP' does not exist, creating it..."
    New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd)' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22
} else {
    Write-Output "Firewall rule 'OpenSSH-Server-In-TCP' has been created and exists."
}

# Set default shell to Powershell
New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell -Value "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force

$keyDownloadScript = Join-Path $env:ProgramData 'ssh\download-key.ps1'

@'
# Download private key to $env:ProgramData\ssh\administrators_authorized_keys
$openSSHAuthorizedKeys = Join-Path $env:ProgramData 'ssh\administrators_authorized_keys'

$keyUrl = "http://169.254.169.254/latest/meta-data/public-keys/0/openssh-key"
Invoke-WebRequest $keyUrl -OutFile $openSSHAuthorizedKeys

# Ensure ACL for administrators_authorized_keys is correct
# See https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_server_configuration#authorizedkeysfile
icacls.exe $openSSHAuthorizedKeys /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"
'@ | Out-File $keyDownloadScript

# Create Task
$taskName = "DownloadKey"
$principal = New-ScheduledTaskPrincipal -UserID "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$action = New-ScheduledTaskAction -Execute 'Powershell.exe' -Argument "-NoProfile -File ""$keyDownloadScript"""
$trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -TaskName $taskName -Description $taskName

# Fetch key via $keyDownloadScript
& Powershell.exe -ExecutionPolicy Bypass -File $keyDownloadScript

</powershell>
