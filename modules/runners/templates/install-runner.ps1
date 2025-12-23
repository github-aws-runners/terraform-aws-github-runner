## install the runner

Write-Host "Creating actions-runner directory for the GH Action installation"
New-Item -ItemType Directory -Path C:\actions-runner -Force | Out-Null
Set-Location C:\actions-runner

$runnerTarballUrl = $Env:RUNNER_TARBALL_URL
$s3RunnerDistribution = $Env:S3_LOCATION_RUNNER_DISTRIBUTION

if ([string]::IsNullOrWhiteSpace($runnerTarballUrl) -and [string]::IsNullOrWhiteSpace($s3RunnerDistribution)) {
  Write-Host "Neither RUNNER_TARBALL_URL nor S3_LOCATION_RUNNER_DISTRIBUTION are set" -ForegroundColor Red
  exit 1
}

$fileName = "actions-runner.zip"

if (-not [string]::IsNullOrWhiteSpace($runnerTarballUrl)) {
  Write-Host "Downloading the GH Action runner from $runnerTarballUrl to $fileName"
  Invoke-WebRequest -Uri $runnerTarballUrl -OutFile $fileName -UseBasicParsing
}
else {
  Write-Host "Downloading the GH Action runner from s3 bucket $s3RunnerDistribution"
  aws s3 cp $s3RunnerDistribution $fileName | Out-Null
}

Write-Host "Un-zip action runner"
Expand-Archive -Path actions-runner.zip -DestinationPath .

Write-Host "Delete zip file"
Remove-Item actions-runner.zip

