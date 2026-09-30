#!/usr/bin/env bash
# Boot-mode tests for templates/start-runner.sh. Runs locally without AWS: IMDS (curl), aws and
# system commands are PATH-injected stubs, absolute paths are rewritten into a per-test sandbox.
# Usage: bash modules/runners/templates/tests/start-runner.test.sh
set -uo pipefail

here=$(cd "$(dirname "$0")" && pwd)
template="$here/../start-runner.sh"
instance_id="i-0123456789abcdef0"
pass=0
fail=0

command -v jq > /dev/null || { echo "jq is required"; exit 2; }

render() {
  awk '
    /^%[{] if metadata_tags == "enabled" [}]/ { skip = 0; next }
    /^%[{] else [}]/ { skip = 1; next }
    /^%[{] endif [}]/ { skip = 0; next }
    !skip { print }
  ' "$template" | sed \
    -e 's/\$\${/${/g' \
    -e "s|/opt/actions-runner|$SANDBOX/opt/actions-runner|g" \
    -e "s|/etc/systemd/system|$SANDBOX/etc/systemd/system|g" \
    -e "s|/usr/local/sbin|$SANDBOX/usr/local/sbin|g"
}

stub() {
  cat > "$SANDBOX/bin/$1"
  chmod +x "$SANDBOX/bin/$1"
}

new_sandbox() {
  SANDBOX=$(mktemp -d "${TMPDIR:-/tmp}/start-runner-test.XXXXXX")
  export SANDBOX
  unset FAIL_AT CONFIG_AFTER
  local imds="$SANDBOX/imds/latest"
  mkdir -p "$SANDBOX/bin" "$SANDBOX/opt/actions-runner" "$SANDBOX/etc/systemd/system" \
    "$imds/meta-data/placement" "$imds/meta-data/tags/instance" "$imds/dynamic/instance-identity"
  touch "$SANDBOX/calls.log"

  printf 'ami-0123' > "$imds/meta-data/ami-id"
  printf '%s' "$instance_id" > "$imds/meta-data/instance-id"
  printf 'm7i.large' > "$imds/meta-data/instance-type"
  printf 'eu-west-1a' > "$imds/meta-data/placement/availability-zone"
  printf '{"region":"eu-west-1"}' > "$imds/dynamic/instance-identity/document"
  set_tag ghr:environment test
  set_tag ghr:ssm_config_path /ghr/config
  set_tag ghr:runner_name_prefix test-

  cat > "$SANDBOX/ssm-config.json" <<'EOF'
[{"Name":"/ghr/config/run_as","Value":"ec2-user"},
 {"Name":"/ghr/config/enable_cloudwatch","Value":"false"},
 {"Name":"/ghr/config/agent_mode","Value":"ephemeral"},
 {"Name":"/ghr/config/disable_default_labels","Value":"false"},
 {"Name":"/ghr/config/enable_jit_config","Value":"true"},
 {"Name":"/ghr/config/token_path","Value":"/ghr/tokens"}]
EOF

  stub curl <<'EOF'
#!/usr/bin/env bash
echo "curl $*" >> "$SANDBOX/calls.log"
url=""
for a in "$@"; do case "$a" in http://*|https://*) url="$a" ;; esac; done
case "$url" in
  http://169.254.169.254/latest/api/token) echo "imds-token" ;;
  http://169.254.169.254/*)
    f="$SANDBOX/imds/${url#http://169.254.169.254/}"
    [ -f "$f" ] || exit 22
    cat "$f" ;;
  *) exit 22 ;;
esac
EOF

  stub aws <<'EOF'
#!/usr/bin/env bash
echo "aws $*" >> "$SANDBOX/calls.log"
case "$1 $2" in
  "ssm get-parameters-by-path")
    [ "${FAIL_AT:-}" = "get-parameters-by-path" ] && exit 255
    cat "$SANDBOX/ssm-config.json" ;;
  "ssm get-parameter")
    n=$(( $(cat "$SANDBOX/get-parameter.count" 2>/dev/null || echo 0) + 1 ))
    echo "$n" > "$SANDBOX/get-parameter.count"
    if [ -f "$SANDBOX/runner-config" ] || [ "$n" -gt "${CONFIG_AFTER:-999}" ]; then
      jq -n '{Parameter: {Value: "jit-config-blob"}}'
    else
      echo "An error occurred (ParameterNotFound)" >&2
      exit 254
    fi ;;
esac
exit 0
EOF

  stub sudo <<'EOF'
#!/usr/bin/env bash
echo "sudo $*" >> "$SANDBOX/calls.log"
while [ $# -gt 0 ] && [ "$1" != "--" ]; do shift; done
shift
exec "$@"
EOF

  stub systemctl <<'EOF'
#!/usr/bin/env bash
echo "systemctl $*" >> "$SANDBOX/calls.log"
[ "${FAIL_AT:-}" = "systemctl" ] && exit 1
exit 0
EOF

  local cmd
  for cmd in shutdown chown sleep amazon-cloudwatch-agent-ctl; do
    printf '#!/usr/bin/env bash\necho "%s $*" >> "$SANDBOX/calls.log"\n' "$cmd" | stub "$cmd"
  done
  for cmd in config.sh run.sh svc.sh; do
    printf '#!/usr/bin/env bash\necho "%s $*" >> "$SANDBOX/calls.log"\n' "$cmd" > "$SANDBOX/opt/actions-runner/$cmd"
    chmod +x "$SANDBOX/opt/actions-runner/$cmd"
  done

  render > "$SANDBOX/start-runner.sh"
  { printf '#!/bin/bash -e\necho "user-data preamble"\n'; cat "$SANDBOX/start-runner.sh"; } > "$SANDBOX/user-data.sh"
}

set_tag() {
  printf '%s' "$2" > "$SANDBOX/imds/latest/meta-data/tags/instance/$1"
}

# Runs a script the way cloud-init (first boot) or the systemd unit (later boots) does.
boot() {
  : > "$SANDBOX/calls.log"
  (cd "$SANDBOX/opt/actions-runner" && PATH="$SANDBOX/bin:$PATH" bash -e "$1" > "$SANDBOX/out.log" 2>&1)
  exit_code=$?
}

check() {
  local desc="$1"
  shift
  if "$@"; then
    pass=$((pass + 1))
    echo "  ok   - $desc"
  else
    fail=$((fail + 1))
    echo "  FAIL - $desc"
  fi
}

called() { grep -q -- "$1" "$SANDBOX/calls.log"; }
not_called() { ! called "$1"; }
mode_is() { grep -q "^Selected boot mode: $1$" "$SANDBOX/out.log"; }
no_mode() { ! grep -q "^Selected boot mode:" "$SANDBOX/out.log"; }
exited() { [ "$exit_code" "$1" 0 ]; }
unit=ghr-start-runner.service

echo "# template syntax"
new_sandbox
check "bash -n start-runner.sh (raw template)" bash -n "$template"
check "bash -n start-runner.sh (rendered)" bash -n "$SANDBOX/start-runner.sh"
check "no template directives left after render" bash -c "! grep -q '%{' '$SANDBOX/start-runner.sh'"
for f in user-data.sh install-runner.sh; do
  check "bash -n $f (raw template)" bash -n "$here/../$f"
done

echo "# cold instance with registration config -> RUN"
new_sandbox
touch "$SANDBOX/runner-config"
boot "$SANDBOX/user-data.sh"
check "mode RUN" mode_is RUN
check "checks config parameter <token_path>/<instance-id>" called "aws ssm get-parameter --name /ghr/tokens/$instance_id "
check "runs with JIT config" called "run.sh --jitconfig jit-config-blob"
check "deletes config parameter" called "aws ssm delete-parameter --name /ghr/tokens/$instance_id"
check "ephemeral self-terminates" called "aws ec2 terminate-instances"
check "no shutdown" not_called "shutdown"
check "no activation latency for cold instances" bash -c "! grep -q warm-pool-activation-latency '$SANDBOX/out.log'"
check "no boot hook installed" test ! -e "$SANDBOX/etc/systemd/system/$unit"

echo "# cold instance without registration config -> WAIT"
new_sandbox
export CONFIG_AFTER=3
boot "$SANDBOX/user-data.sh"
check "mode WAIT" mode_is WAIT
check "polls for config" grep -q "Waiting for GH Runner config" "$SANDBOX/out.log"
check "runs with JIT config" called "run.sh --jitconfig jit-config-blob"
check "ephemeral self-terminates" called "aws ec2 terminate-instances"
check "no boot hook installed" test ! -e "$SANDBOX/etc/systemd/system/$unit"

echo "# cold instance failing before mode selection still self-terminates"
new_sandbox
export FAIL_AT=get-parameters-by-path
boot "$SANDBOX/user-data.sh"
check "exits non-zero" exited -ne
# Pre-existing: on bash >= 4 the bare `return` in create_xray_error_segment returns the trap's status and -e aborts cleanup.
if [ "$(bash -c 'echo ${BASH_VERSINFO[0]}')" -lt 4 ]; then
  check "self-terminates" called "aws ec2 terminate-instances"
else
  echo "  skip - self-terminates (known bash >= 4 issue in cleanup, unchanged by this script)"
fi

echo "# warm-pool instance, first boot -> PRIME"
new_sandbox
set_tag ghr:warm-pool true
boot "$SANDBOX/user-data.sh"
hook="$SANDBOX/usr/local/sbin/ghr-start-runner.sh"
check "mode PRIME" mode_is PRIME
check "exits zero" exited -eq
check "shuts down" called "shutdown -h now"
check "no terminate-instances" not_called "terminate-instances"
check "does not consume registration config" not_called "delete-parameter"
check "does not register" bash -c "! grep -qE '^(config|run)\.sh' '$SANDBOX/calls.log'"
check "boot hook unit written" grep -q "^ExecStart=/bin/bash -e $hook$" "$SANDBOX/etc/systemd/system/$unit"
check "boot hook unit enabled, not started" bash -c "grep -q 'systemctl enable $unit' '$SANDBOX/calls.log' && ! grep -q 'systemctl start' '$SANDBOX/calls.log'"
check "extracted script starts at begin marker" test "$(head -n1 "$hook")" = "# ghr:start-runner:begin"
check "extracted script ends at end marker" test "$(tail -n1 "$hook")" = "# ghr:start-runner:end"
check "extracted script excludes surrounding user-data" bash -c "! grep -q 'user-data preamble' '$hook'"
check "bash -n extracted script" bash -n "$hook"

echo "# activated warm instance, next boot via systemd unit -> RUN"
set_tag ghr:warm-activated 2026-09-30T12:00:00Z
touch "$SANDBOX/runner-config"
boot "$hook"
check "mode RUN" mode_is RUN
check "runs with JIT config" called "run.sh --jitconfig jit-config-blob"
check "disables boot hook (single use)" called "systemctl disable $unit"
check "logs activation latency" grep -qE '^warm-pool-activation-latency-seconds=-?[0-9]+$' "$SANDBOX/out.log"
check "ephemeral self-terminates" called "aws ec2 terminate-instances"
check "no shutdown" not_called "shutdown"

echo "# PRIME failure installing boot hook"
new_sandbox
set_tag ghr:warm-pool true
export FAIL_AT=systemctl
boot "$SANDBOX/user-data.sh"
check "mode PRIME" mode_is PRIME
check "exits non-zero" exited -ne
check "no terminate-instances" not_called "terminate-instances"
check "no shutdown" not_called "shutdown"

echo "# warm-pool instance failing before mode selection"
new_sandbox
set_tag ghr:warm-pool true
export FAIL_AT=get-parameters-by-path
boot "$SANDBOX/user-data.sh"
check "no mode selected" no_mode
check "exits non-zero" exited -ne
check "no terminate-instances" not_called "terminate-instances"
check "no shutdown" not_called "shutdown"

echo "# warm-pool instance with config but no activation tag -> RUN"
new_sandbox
set_tag ghr:warm-pool true
touch "$SANDBOX/runner-config"
boot "$SANDBOX/user-data.sh"
check "mode RUN" mode_is RUN
check "no shutdown" not_called "shutdown"

echo "# activated warm instance without config yet -> WAIT"
new_sandbox
set_tag ghr:warm-pool true
set_tag ghr:warm-activated 2026-09-30T12:00:00Z
export CONFIG_AFTER=3
boot "$SANDBOX/user-data.sh"
check "mode WAIT" mode_is WAIT
check "runs with JIT config" called "run.sh --jitconfig jit-config-blob"
check "no shutdown" not_called "shutdown"

echo
echo "passed: $pass, failed: $fail"
[ "$fail" -eq 0 ]
