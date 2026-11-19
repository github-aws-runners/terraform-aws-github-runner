#!/bin/bash
set -e

### CHECKS ###

function testCommand() {
  if ! command -v $1 &> /dev/null
  then
      echo "$1 could not be found"
      exit
  fi
}

testCommand gh

# create usages function usages mesaages. APP_ID and APP_PRIVATE_KEY_PATH are required as parameter or environment variable
usages() {
    echo "Description: Update the GitHub App webhook configuration with terraform output for the webhook output of the module." >&2
    echo " " >&2
    echo "Usage: $0" >&2
    echo "Usage: $0 [-h]" >&2
    echo "  <no flags>                   Use environment variables" >&2
    echo "  -a APP_ID                    GitHub App ID" >&2
    echo "  -k APP_PRIVATE_KEY_BASE64    Base64 encoded private key of the GitHub App" >&2
    echo "  -f APP APP_PRIVATE_KEY_FILE  Path to the private key of the GitHub App" >&2
    echo "  -p APP_PRIVATE_KEY_SSM_ARN   ARN of an SSM parameter holding the base64 encoded private key, takes precedence over -k and -f" >&2
    echo "  -r SSM_ASSUME_ROLE_ARN       IAM role to assume before reading the SSM parameter" >&2
    echo "  -e WEBHOOK_ENDPOINT          Webhook endpoint" >&2
    echo "  -s WEBHOOK_SECRET            Webhook secret" >&2
    echo "  -h                           Show this help message" >&2
    exit 1
}

# hadd h flag to show help
while getopts a:f:k:p:r:s:e:h flag
do
    case "${flag}" in
        a) APP_ID=${OPTARG};;
        f) APP_PRIVATE_KEY_FILE=${OPTARG};;
        k) APP_PRIVATE_KEY_BASE64=${OPTARG};;
        p) APP_PRIVATE_KEY_SSM_ARN=${OPTARG};;
        r) SSM_ASSUME_ROLE_ARN=${OPTARG};;
        e) WEBHOOK_ENDPOINT=${OPTARG};;
        s) WEBHOOK_SECRET=${OPTARG};;
        h) usages ;;
    esac
done

if [ -z "$APP_ID" ]; then
  echo "APP_ID must be set"
  usages
fi

# check one of variables APP_PRIVATE_KEY_PATH or APP_PRIVATE_KEY are set
if [ -z "$APP_PRIVATE_KEY_BASE64" ] && [ -z "$APP_PRIVATE_KEY_FILE" ] && [ -z "$APP_PRIVATE_KEY_SSM_ARN" ]; then
  echo "APP_PRIVATE_KEY_BASE64, APP_PRIVATE_KEY_FILE or APP_PRIVATE_KEY_SSM_ARN must be set"
  usages
fi

### Terraform outputs ###

if [ -z "$WEBHOOK_ENDPOINT" ]; then
  testCommand terraform
  WEBHOOK_ENDPOINT=$(terraform output --raw webhook_endpoint)
fi

if [ -z "$WEBHOOK_SECRET" ]; then
  testCommand terraform
  WEBHOOK_SECRET=$(terraform output --raw webhook_secret)
fi

### READ PRIVATE KEY FROM SSM ###

if [ -n "$APP_PRIVATE_KEY_SSM_ARN" ]; then
  testCommand aws
  # The region is the fourth field of arn:aws:ssm:<region>:<account>:parameter/<name>
  SSM_REGION=$(echo "$APP_PRIVATE_KEY_SSM_ARN" | cut -d: -f4)

  # Assumed-role credentials are scoped to the get-parameter call only
  if [ -n "$SSM_ASSUME_ROLE_ARN" ]; then
    ROLE_CREDENTIALS=$(aws sts assume-role \
      --role-arn "$SSM_ASSUME_ROLE_ARN" \
      --role-session-name webhook-github-app \
      --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' \
      --output text)
    read -r ROLE_ACCESS_KEY_ID ROLE_SECRET_ACCESS_KEY ROLE_SESSION_TOKEN <<< "$ROLE_CREDENTIALS"
    APP_PRIVATE_KEY_BASE64=$(AWS_ACCESS_KEY_ID="$ROLE_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$ROLE_SECRET_ACCESS_KEY" AWS_SESSION_TOKEN="$ROLE_SESSION_TOKEN" \
      aws ssm get-parameter --region "$SSM_REGION" --name "$APP_PRIVATE_KEY_SSM_ARN" --with-decryption --query Parameter.Value --output text)
  else
    APP_PRIVATE_KEY_BASE64=$(aws ssm get-parameter --region "$SSM_REGION" --name "$APP_PRIVATE_KEY_SSM_ARN" --with-decryption --query Parameter.Value --output text)
  fi
fi

### CREATE JWT TOKEN ###

# Generate the JWT header and payload
HEADER=$(echo -n '{"alg":"RS256","typ":"JWT"}' | base64 | tr -d '\n')
PAYLOAD=$(echo -n "{\"iat\":$(date +%s),\"exp\":$(( $(date +%s) + 600 )),\"iss\":$APP_ID}" | base64 | tr -d '\n')

# Generate the signature
if [ -z "$APP_PRIVATE_KEY_BASE64" ]; then
  APP_PRIVATE_KEY_BASE64=$(cat $APP_PRIVATE_KEY_FILE | base64 | tr -d '\n')
fi

SIGNATURE=$(echo -n "$HEADER.$PAYLOAD" | openssl dgst -sha256 -sign <(echo -e "$APP_PRIVATE_KEY_BASE64" | base64 -d) | base64 | tr -d '\n')

JWT_TOKEN="$HEADER.$PAYLOAD.$SIGNATURE"


### UPDATE WEBHOOK ###

gh api \
  --method PATCH \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  /app/hook/config \
  -f content_type='json' \
 -f insecure_ssl='0' \
 -f secret=${WEBHOOK_SECRET} \
 -f url=${WEBHOOK_ENDPOINT}
