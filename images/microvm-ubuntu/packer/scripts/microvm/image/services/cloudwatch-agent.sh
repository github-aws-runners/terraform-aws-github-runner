#!/command/with-contenv bash
# shellcheck shell=bash

set -euo pipefail

readonly agent_root=/opt/aws/amazon-cloudwatch-agent
readonly config_directory=/etc/cwagentconfig
readonly config_path="${config_directory}/config.json"
readonly microvm_id="${MICROVM_ID:?}"
readonly runner_config_ssm_path="${RUNNER_CONFIG_SSM_PATH:?}"

read_parameter() {
    AWS_PAGER='' /usr/local/bin/aws ssm get-parameter \
        --name "$1" \
        --query Parameter.Value \
        --output text \
        --no-cli-pager
}

enabled="$(read_parameter "${runner_config_ssm_path}/enable_cloudwatch")"
if [[ "$enabled" == false ]]; then
    printf '[cloudwatch-agent] disabled by runner configuration\n' >&2
    /command/s6-svc -d /run/service/cloudwatch-agent
    exit 0
fi
if [[ "$enabled" != true ]]; then
    printf '[cloudwatch-agent] enable_cloudwatch must be true or false\n' >&2
    exit 1
fi

install -d -m 0700 -o root -g root "$config_directory"
umask 077
read_parameter "${runner_config_ssm_path}/cloudwatch_agent_config_runner" |
    MICROVM_ID="$microvm_id" jq --exit-status '
    select(type == "object") |
    walk(
        if type == "string" then
            gsub("\\{microvm_id\\}"; env.MICROVM_ID)
        else
            .
        end
    )
' >"$config_path"
chmod 0600 "$config_path"

exec env \
    RUN_IN_AWS=True \
    RUN_IN_CONTAINER=True \
    "${agent_root}/bin/start-amazon-cloudwatch-agent"
