#!/bin/bash -e
exec > >(tee /var/log/runner-startup.log | logger -t user-data -s 2>/dev/console) 2>&1

cd /opt/actions-runner

## This wrapper file re-uses scripts in the /modules/runners/templates directory
## of this repo. These are the same that are used by the user_data functionality 
## to bootstrap the instance if it is started from an existing AMI.
${start_runner}
