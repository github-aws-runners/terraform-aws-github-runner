#!/bin/bash -e
exec > >(tee /var/log/user-data.log | logger -t user-data -s 2>/dev/console) 2>&1

${pre_install}

yum update -y

# Install docker
amazon-linux-extras install -y docker
service docker start
usermod -a -G docker ec2-user

yum install -y curl jq git

# Install runner
cd /home/ec2-user
mkdir actions-runner && cd actions-runner

aws s3 cp ${s3_location_runner_distribution} actions-runner.tar.gz
tar xzf ./actions-runner.tar.gz
rm -rf actions-runner.tar.gz

%{ if runner_architecture == "arm64" ~}
# Patch for ARM64 (no ICU install by default)
yum install -y patch
patch -p1 <<ICU_PATCH
diff -Naur a/bin/Runner.Listener.runtimeconfig.json b/bin/Runner.Listener.runtimeconfig.json
--- a/bin/Runner.Listener.runtimeconfig.json	2020-07-01 02:21:09.000000000 +0000
+++ b/bin/Runner.Listener.runtimeconfig.json	2020-07-28 00:02:38.748868613 +0000
@@ -8,7 +8,8 @@
       }
     ],
     "configProperties": {
-      "System.Runtime.TieredCompilation.QuickJit": true
+      "System.Runtime.TieredCompilation.QuickJit": true,
+      "System.Globalization.Invariant": true
     }
   }
-}
\ No newline at end of file
+}
diff -Naur a/bin/Runner.PluginHost.runtimeconfig.json b/bin/Runner.PluginHost.runtimeconfig.json
--- a/bin/Runner.PluginHost.runtimeconfig.json	2020-07-01 02:21:22.000000000 +0000
+++ b/bin/Runner.PluginHost.runtimeconfig.json	2020-07-28 00:02:59.358680003 +0000
@@ -8,7 +8,8 @@
       }
     ],
     "configProperties": {
-      "System.Runtime.TieredCompilation.QuickJit": true
+      "System.Runtime.TieredCompilation.QuickJit": true,
+      "System.Globalization.Invariant": true
     }
   }
-}
\ No newline at end of file
+}
diff -Naur a/bin/Runner.Worker.runtimeconfig.json b/bin/Runner.Worker.runtimeconfig.json
--- a/bin/Runner.Worker.runtimeconfig.json	2020-07-01 02:21:16.000000000 +0000
+++ b/bin/Runner.Worker.runtimeconfig.json	2020-07-28 00:02:19.159028531 +0000
@@ -8,7 +8,8 @@
       }
     ],
     "configProperties": {
-      "System.Runtime.TieredCompilation.QuickJit": true
+      "System.Runtime.TieredCompilation.QuickJit": true,
+      "System.Globalization.Invariant": true
     }
   }
-}
\ No newline at end of file
+}
ICU_PATCH
%{ endif ~}

INSTANCE_ID=$(wget -q -O - http://169.254.169.254/latest/meta-data/instance-id)
REGION=$(curl -s 169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region)

echo wait for configuration
while [[ $(aws ssm get-parameters --names ${environment}-$INSTANCE_ID --with-decryption --region $REGION | jq -r ".Parameters | .[0] | .Value") == null ]]; do
    echo Waiting for configuration ...
    sleep 1
done
CONFIG=$(aws ssm get-parameters --names ${environment}-$INSTANCE_ID --with-decryption --region $REGION | jq -r ".Parameters | .[0] | .Value")
aws ssm delete-parameter --name ${environment}-$INSTANCE_ID --region $REGION

export RUNNER_ALLOW_RUNASROOT=1
./config.sh --unattended --name $INSTANCE_ID --work "_work" $CONFIG

chown -R ec2-user:ec2-user .
./svc.sh install ${service_user}

${post_install}

./svc.sh start
