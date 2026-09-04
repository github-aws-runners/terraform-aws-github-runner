#!/command/with-contenv bash
# shellcheck shell=bash

set -euo pipefail

readonly internal_services_log=/var/log/microvm/internal-services.log
readonly microvm_id="${MICROVM_ID:?}"
readonly runner_config_ssm_path="${RUNNER_CONFIG_SSM_PATH:?}"
readonly s6_environment=/run/s6/container_environment

exec > >(/usr/bin/tee --append -- "$internal_services_log")
exec 2> >(/usr/bin/tee --append -- "$internal_services_log" >&2)

if [[ -z "${MICROVM_SERVICES:-}" ]]; then
    exit 0
fi

IFS=',' read -r -a services <<<"${MICROVM_SERVICES}"
for service in "${services[@]}"; do
    [[ -z "$service" ]] && continue
    if [[ ! "$service" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$ ]]; then
        printf '[microvm-services] invalid service name: %s\n' "$service" >&2
        exit 2
    fi
    if [[ ! -d "/run/service/${service}" ]]; then
        printf '[microvm-services] service is unavailable: %s\n' "$service" >&2
        exit 1
    fi
done

printf '%s' "$microvm_id" >"${s6_environment}/MICROVM_ID"
chmod 0600 "${s6_environment}/MICROVM_ID"
printf '%s' "$runner_config_ssm_path" >"${s6_environment}/RUNNER_CONFIG_SSM_PATH"
chmod 0600 "${s6_environment}/RUNNER_CONFIG_SSM_PATH"

for service in "${services[@]}"; do
    [[ -z "$service" ]] && continue
    /command/s6-svc -u "/run/service/${service}"
done
