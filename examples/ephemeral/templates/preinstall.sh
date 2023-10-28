#!/bin/bash

# create xray daemon service
curl https://s3.us-east-2.amazonaws.com/aws-xray-assets.us-east-2/xray-daemon/aws-xray-daemon-3.x.rpm -o /home/ec2-user/xray.rpm
yum install -y /home/ec2-user/xray.rpm
sudo systemctl enable xray
sudo systemctl status xray

# https://docs.aws.amazon.com/xray/latest/devguide/xray-api-sendingdata.html
# https://docs.aws.amazon.com/xray/latest/devguide/scorekeep-scripts.html
create_xray_start_segment() {
  START_TIME=$(date +%s)
  TRACE_ID=$1
  INSTANCE_ID=$2
  SEGMENT_ID=$(dd if=/dev/random bs=8 count=1 2>/dev/null | od -An -tx1 | tr -d ' \t\n')
  SEGMENT_DOC="{\"trace_id\": \"$TRACE_ID\", \"id\": \"$SEGMENT_ID\", \"start_time\": $START_TIME, \"in_progress\": true, \"name\": \"Runner\",\"origin\": \"AWS::EC2::Instance\", \"aws\": {\"ec2\":{\"instance_id\":\"$INSTANCE_ID\"}}}"
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


