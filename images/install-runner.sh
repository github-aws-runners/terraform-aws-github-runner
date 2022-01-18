#!/bin/bash -e

user_name=$(cat /tmp/install-user.txt)

## This wrapper file re-uses scripts in the /modules/runners/templates directory
## of this repo. These are the same that are used by the user_data functionality 
## to bootstrap the instance if it is started from an existing AMI.
${install_runner}