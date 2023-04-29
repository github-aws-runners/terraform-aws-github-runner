#! /bin/bash

set -e

if [ ! -f ./.env ]; then
    echo "error: Can't find .env file. Please set vars in .env file using .env.example as a template"
    exit 1
fi

. ./.env

# ensure vars used below are set

if [ "x$TERRAFORM_S3_BUCKET" = "x" ]; then
    echo "error: TERRAFORM_S3_BUCKET not set. Please set vars in .env file"
    exit 1
fi
if [ "x$TERRAFORM_S3_KEY" = "x" ]; then
    echo "error: TERRAFORM_S3_KEY not set. Please set vars in .env file"
    exit 1
fi
if [ "x$AWS_DEFAULT_REGION" = "x" ]; then
    echo "error: AWS_DEFAULT_REGION not set. Please set vars in .env file"
    exit 1
fi
if [ "x$TERRAFORM_DYNAMODB_LOCK_TABLE" = "x" ]; then
    echo "error: TERRAFORM_DYNAMODB_LOCK_TABLE not set. Please set vars in .env file"
    exit 1
fi

terraform init -backend=true \
  -backend-config="bucket=$TERRAFORM_S3_BUCKET" \
  -backend-config="key=$TERRAFORM_S3_KEY" \
  -backend-config="region=$AWS_DEFAULT_REGION" \
  -backend-config="dynamodb_table=$TERRAFORM_DYNAMODB_LOCK_TABLE" \
  -backend-config="encrypt=true"
