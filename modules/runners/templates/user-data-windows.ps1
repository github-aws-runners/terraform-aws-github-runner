<powershell>

$ErrorActionPreference="SilentlyContinue"
Stop-Transcript | out-null
$ErrorActionPreference = "Continue"
New-Item -Path C:\tmp -ItemType directory
cd C:\tmp
$todaytime = Get-Date -UFormat '%Y%m%d%H%M'
Start-Transcript -path C:\tmp\"$todaytime"_output.txt -append
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host $(date) '------------------------Install AWS Cli-------------------------'

iwr https://awscli.amazonaws.com/AWSCLIV2.msi -OutFile C:\tmp\aws-cli.msi
Start-Process msiexec.exe -Wait -ArgumentList '/I  C:\tmp\aws-cli.msi /quiet'
Copy-Item 'C:\Program Files\Amazon\AWSCLIV2\botocore\cacert.pem' 'C:\Program Files\Amazon\AWSCLIV2\certifi'
$env:Path = "$env:Path;C:\Program Files\Amazon\AWSCLIV2"

# Do some stuff

Write-Host $(date) '---------------------download action runner binary file---------------------'

Invoke-WebRequest -Uri https://github.com/actions/runner/releases/download/v2.274.2/actions-runner-win-x64-2.274.2.zip -OutFile actions-runner-win-x64-2.272.0.zip 


Add-Type -AssemblyName System.IO.Compression.FileSystem ; [System.IO.Compression.ZipFile]::ExtractToDirectory("$PWD/actions-runner-win-x64-2.272.0.zip", "$PWD")
echo $pwd


Write-Host $(date) '----------------get the instance id and region-------------------------'
$token = Invoke-RestMethod -Headers @{"X-aws-ec2-metadata-token-ttl-seconds" = "21600"} -Method PUT –Uri http://169.254.169.254/latest/api/token
$INSTANCE_ID=Invoke-RestMethod -Headers @{"X-aws-ec2-metadata-token" = $token} -Method GET -Uri http://169.254.169.254/latest/meta-data/instance-id
echo $INSTANCE_ID
$availability_zone = invoke-restmethod -uri http://169.254.169.254/latest/meta-data/placement/availability-zone
$REGION = $availability_zone.Substring(0,$availability_zone.Length-1)
echo $REGION 
Write-Host $(date) '----------------download the jq.exe------------------------------------'
Invoke-WebRequest -Uri https://github.com/stedolan/jq/releases/download/jq-1.6/jq-win64.exe -OutFile jq.exe


echo "wait for configuration"
$CONFIG = "null"
$count=1
$entireparams=(aws ssm get-parameters --names ${environment}-$INSTANCE_ID --with-decryption --region $REGION)
echo $entireparams
Write-Host $(date) '----------------get parameters of ssm, url and token etc------------------------'
do{
$CONFIG=(aws ssm get-parameters --names ${environment}-$INSTANCE_ID --with-decryption --region $REGION | ./jq -r ".Parameters | .[0] | .Value")
     echo Waiting for configuration ...
    sleep 1
    $count++
  
}
while (($CONFIG -eq "null")-AND($count -lt 30))
echo "the parameter"$CONFIG
echo "count"$count
echo $pwd
#$CONFIG=(aws ssm get-parameters --names ${environment}-$INSTANCE_ID --with-decryption --region $REGION | ./jq -r ".Parameters | .[0] | .Value")
aws ssm delete-parameter --name ${environment}-$INSTANCE_ID --region $REGION
echo $pwd
echo "./config.cmd --name $INSTANCE_ID --work "_work" $CONFIG --unattended"
dir
Write-Host $(date) '----------------run the action runner config command------------------------'
$runconfig=".\config.cmd --unattended --name $INSTANCE_ID  $CONFIG"
iex $runconfig
#./config.cmd --name $INSTANCE_ID --work "_work" $CONFIG --unattended
Write-Host $(date) '----------------upload the logs before running run.cmd, check if can be done sooner------------------------'
.\run.cmd
Write-Host $(date) '----------------upload the logs before transcript stops, check if can be done sooner------------------------'

Stop-Transcript
Write-Host $(date) '----------------upload the logs------------------------'

</powershell>