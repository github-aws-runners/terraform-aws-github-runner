## install the runner

$s3_location = "${S3_LOCATION_RUNNER_DISTRIBUTION}"

if ([string]::IsNullOrEmpty($env:RUNNER_TARBALL_URL) -and [string]::IsNullOrEmpty($s3_location)) {
  Write-Error "Neither RUNNER_TARBALL_URL or s3_location are set"
  exit 1
}

Write-Host "Creating actions-runner directory for the GH Action installation"
New-Item -ItemType Directory -Path C:\actions-runner ; Set-Location C:\actions-runner

if (-not [string]::IsNullOrEmpty($env:RUNNER_TARBALL_URL)) {
  Write-Host "Downloading the GH Action runner from $env:RUNNER_TARBALL_URL"
  Invoke-WebRequest -Uri $env:RUNNER_TARBALL_URL -OutFile actions-runner.zip -UseBasicParsing
} else {
  Write-Host "Downloading the GH Action runner from s3 bucket $s3_location"
  aws s3 cp $s3_location actions-runner.zip
}

Write-Host "Un-zip action runner"
Expand-Archive -Path actions-runner.zip -DestinationPath .

Write-Host "Delete zip file"
Remove-Item actions-runner.zip
