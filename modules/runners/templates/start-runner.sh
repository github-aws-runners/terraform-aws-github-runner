# shellcheck shell=bash

## Start the runner
echo "Starting runner after $(awk '{print int($1/3600)":"int(($1%3600)/60)":"int($1%60)}' /proc/uptime)"
echo "Starting the runner as user $run_as"

if [[ $agent_mode = "ephemeral" ]]; then

cat >/opt/start-runner-service.sh <<-EOF
  echo "Starting the runner in ephemeral mode"
  sudo --preserve-env=RUNNER_ALLOW_RUNASROOT -u "$run_as" -- ./run.sh
  echo "Runner has finished"

  echo "Stopping cloudwatch service"
  systemctl stop amazon-cloudwatch-agent.service
  echo "Terminating instance"
  aws ec2 terminate-instances --instance-ids "$instance_id" --region "$region"
EOF
  chmod 755 /opt/start-runner-service.sh
  # Starting the runner via a own process to ensure this process terminates
  nohup /opt/start-runner-service.sh &

else
  echo "Installing the runner as a service"
  ./svc.sh install "$run_as"
  echo "Starting the runner in persistent mode"
  ./svc.sh start
fi
