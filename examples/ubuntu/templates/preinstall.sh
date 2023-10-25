#!/bin/bash

# create xray daemon service
wget https://s3.dualstack.eu-west-1.amazonaws.com/aws-xray-assets.eu-west-1/xray-daemon/aws-xray-daemon-3.x.deb
sudo dpkg -i aws-xray-daemon-3.x.deb
sudo systemctl enable xray
sudo systemctl status xray

# https://docs.aws.amazon.com/xray/latest/devguide/xray-api-sendingdata.html
# https://docs.aws.amazon.com/xray/latest/devguide/scorekeep-scripts.html
create_xray_start_segment() {
  START_TIME=$(date +%s)
  TRACE_ID=$1
  INSTANCE_ID=$2
  SEGMENT_ID=$(dd if=/dev/random bs=8 count=1 2>/dev/null | od -An -tx1 | tr -d ' \t\n')
  SEGMENT_DOC="{\"trace_id\": \"$TRACE_ID\", \"id\": \"$SEGMENT_ID\", \"start_time\": $START_TIME, \"in_progress\": true, \"name\": \"Runner\",\"origin\": \"AWS::EC2::Instance\", \"aws\": {\"ec2\":{\"instance_id\":\"$INSTANCE_ID\"}, \"cloudwatch_logs\":[{\"log_group\": \"/github-self-hosted-runners/ubuntu/user_data\", \"arn\": \"arn:aws:logs:eu-west-1:734162824207:log-group:/github-self-hosted-runners/ubuntu/user_data:*\"}]}}"
  HEADER='{"format": "json", "version": 1}'
  TRACE_DATA="$HEADER\n$SEGMENT_DOC"
  echo "$HEADER" > document.txt
  echo "$SEGMENT_DOC" >> document.txt
  UDP_IP="127.0.0.1"
  UDP_PORT=2000
  cat document.txt > /dev/udp/$UDP_IP/$UDP_PORT
  echo "$SEGMENT_DOC"
}

create_xray_success_segment() {
  SEGMENT_DOC=$1
  if [ -z "$SEGMENT_DOC" ]; then
    echo "No segment doc provided"
    return
  fi
  SEGMENT_DOC=$(echo "${SEGMENT_DOC}" | jq '. | del(.in_progress)')
  END_TIME=$(date +%s)
  SEGMENT_DOC=$(echo "${SEGMENT_DOC}" | jq -c ". + {\"end_time\": ${END_TIME}}")
  HEADER="{\"format\": \"json\", \"version\": 1}"
  TRACE_DATA="$HEADER\n$SEGMENT_DOC"
  echo "$HEADER" > document.txt
  echo "$SEGMENT_DOC" >> document.txt
  UDP_IP="127.0.0.1"
  UDP_PORT=2000
  cat document.txt > /dev/udp/$UDP_IP/$UDP_PORT
  echo "$SEGMENT_DOC"
}

create_xray_error_segment() {
  SEGMENT_DOC="$1"
  if [ -z "$SEGMENT_DOC" ]; then
    echo "No segment doc provided"
    return
  fi
  MESSAGE="$2"
  ERROR="{\"exceptions\": [{\"message\": \"$MESSAGE\"}]}"
  SEGMENT_DOC=$(echo "${SEGMENT_DOC}" | jq '. | del(.in_progress)')
  END_TIME=$(date +%s)
  SEGMENT_DOC=$(echo "${SEGMENT_DOC}" | jq -c ". + {\"end_time\": ${END_TIME}, \"error\": true, \"cause\": $ERROR }")
  HEADER="{\"format\": \"json\", \"version\": 1}"
  TRACE_DATA="$HEADER\n$SEGMENT_DOC"
  echo "$HEADER" > document.txt
  echo "$SEGMENT_DOC" >> document.txt
  UDP_IP="127.0.0.1"
  UDP_PORT=2000
  cat document.txt > /dev/udp/$UDP_IP/$UDP_PORT
  echo "$SEGMENT_DOC"
}
