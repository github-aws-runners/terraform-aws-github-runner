
$ErrorActionPreference="SilentlyContinue"
Stop-Transcript | out-null
$ErrorActionPreference = "Continue"
Start-Transcript -path output.txt -append
# Do some stuff
mkdir actions-runner; cd actions-runner
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri https://github.com/actions/runner/releases/download/v2.272.0/actions-runner-win-x64-2.272.0.zip -OutFile actions-runner-win-x64-2.272.0.zip 
Add-Type -AssemblyName System.IO.Compression.FileSystem ; [System.IO.Compression.ZipFile]::ExtractToDirectory("$PWD/actions-runner-win-x64-2.272.0.zip", "$PWD")

$token = Invoke-RestMethod -Headers @{"X-aws-ec2-metadata-token-ttl-seconds" = "21600"} -Method PUT –Uri http://169.254.169.254/latest/api/token
$INSTANCE_ID=Invoke-RestMethod -Headers @{"X-aws-ec2-metadata-token" = $token} -Method GET -Uri http://169.254.169.254/latest/meta-data/instance-id
$availability_zone = invoke-restmethod -uri http://169.254.169.254/latest/meta-data/placement/availability-zone
$REGION = $availability_zone.Substring(0,$availability_zone.Length-1)


echo "wait for configuration"
$CONFIG=$null

do{
$CONFIG=(aws ssm get-parameters --names ${environment}"-"$INSTANCE_ID --with-decryption --region $REGION | jq -r ".Parameters | .[0] | .Value")
     echo Waiting for configuration ...
    sleep 1
}
while ($CONFIG = $null)

$CONFIG=(aws ssm get-parameters --names ${environment}"-"$INSTANCE_ID --with-decryption --region $REGION | jq -r ".Parameters | .[0] | .Value")


./config.cmd --unattended --name $INSTANCE_ID --work "_work" $CONFIG 
./run.cmd

Stop-Transcript