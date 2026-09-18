#!/bin/sh

set -eu

: "${MINISTACK_ENDPOINT_URL:?MINISTACK_ENDPOINT_URL is required}"
: "${MINISTACK_REGION:?MINISTACK_REGION is required}"
: "${MINISTACK_IMAGE_NAME:?MINISTACK_IMAGE_NAME is required}"
: "${MINISTACK_IMAGE_ARCHITECTURE:?MINISTACK_IMAGE_ARCHITECTURE is required}"
: "${MINISTACK_IMAGE_LOCATION:?MINISTACK_IMAGE_LOCATION is required}"
: "${MINISTACK_CREATED_IMAGE_ID_FILE:?MINISTACK_CREATED_IMAGE_ID_FILE is required}"

if ! command -v aws >/dev/null 2>&1; then
  echo "AWS CLI is required to register the MiniStack Packer fixture." >&2
  exit 69
fi

ministack_aws() {
  AWS_EC2_METADATA_DISABLED=true aws \
    --endpoint-url "$MINISTACK_ENDPOINT_URL" \
    --region "$MINISTACK_REGION" \
    "$@"
}

ami_id=$(ministack_aws ec2 describe-images \
  --owners self \
  --filters "Name=name,Values=$MINISTACK_IMAGE_NAME" "Name=state,Values=available" \
  --query 'Images[0].ImageId' \
  --output text)

: > "$MINISTACK_CREATED_IMAGE_ID_FILE"

if [ "$ami_id" = "None" ]; then
  ami_id=$(ministack_aws ec2 register-image \
    --name "$MINISTACK_IMAGE_NAME" \
    --description "MiniStack test-only AMI registered by Packer" \
    --architecture "$MINISTACK_IMAGE_ARCHITECTURE" \
    --root-device-name /dev/xvda \
    --virtualization-type hvm \
    --image-location "$MINISTACK_IMAGE_LOCATION" \
    --query 'ImageId' \
    --output text)
  printf '%s\n' "$ami_id" > "$MINISTACK_CREATED_IMAGE_ID_FILE"
fi

printf 'MiniStack Packer fixture ready: %s\n' "$ami_id"
