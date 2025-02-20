#!/bin/bash

# NOTE: this script is only for demonstration purposes

# Script to create SSM parameters outside of Terraform
# and set them as environment variables for Terraform

APP_ID=
APP_PRIVATE_KEY_FILE=
APP_WEBHOOK_SECRET=
APP_PRIVATE_KEY=$(base64 -i $APP_PRIVATE_KEY_FILE)
SSM_PATH="/github-runners/example/app"

if [ -z "$APP_ID" ]; then
  echo "APP_ID is not set"
  exit 1
fi

if [ -z "$APP_WEBHOOK_SECRET" ]; then
  echo "APP_WEBHOOK_SECRET is not set"
  exit 1
fi

if [ -z "$APP_PRIVATE_KEY_FILE" ]; then
  echo "APP_PRIVATE_KEY_FILE is not set"
  exit 1
fi


export AWS_PAGER=""
export AWS_REGION=eu-central-1
export TF_VAR_aws_region=$AWS_REGION


# GitHub App ID
aws ssm put-parameter \
  --name "${SSM_PATH}/github_app_id" \
  --overwrite \
  --value "${APP_ID}" \
  --type "SecureString"

# GitHub App Private Key
aws ssm put-parameter \
  --name "${SSM_PATH}/github_app_key_base64" \
  --overwrite \
  --value "${APP_PRIVATE_KEY}" \
  --type "SecureString"

# GitHub App Installation ID
aws ssm put-parameter \
  --name "${SSM_PATH}/github_app_webhook_secret" \
  --overwrite \
  --value "${APP_WEBHOOK_SECRET}" \
  --type "SecureString"


github_app_id_ssm=$(aws ssm get-parameter --name "${SSM_PATH}/github_app_id" --query 'Parameter.{arn:ARN,name:Name}' --output json)
github_app_key_base64_ssm=$(aws ssm get-parameter --name "${SSM_PATH}/github_app_key_base64" --query 'Parameter.{arn:ARN,name:Name}' --output json)
github_app_webhook_secret_ssm=$(aws ssm get-parameter --name "${SSM_PATH}/github_app_webhook_secret" --query 'Parameter.{arn:ARN,name:Name}' --output json)

export TF_VAR_github_app_ssm_parameters="{
  \"id\": `echo $github_app_id_ssm`,
  \"key_base64\": `echo $github_app_key_base64_ssm`,
  \"webhook_secret\": `echo $github_app_webhook_secret_ssm`
}"

export TF_VAR_environment=external-ssm
