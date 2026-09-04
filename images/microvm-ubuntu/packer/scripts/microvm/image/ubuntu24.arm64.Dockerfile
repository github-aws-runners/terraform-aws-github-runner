# syntax=docker/dockerfile:1

# Lambda MicroVMs currently run ARM64 images. The image contains the Actions
# runner, CloudWatch Agent, S6 overlay, and compiled lifecycle-hook server.
ARG UBUNTU_IMAGE

# hadolint ignore=DL3006
FROM ${UBUNTU_IMAGE} AS tooling

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG AWS_CLI_VERSION="2.36.24"
ARG AWS_CLI_SHA256=c024c45a9d22005f81c7c0fab9e23ee7118ffa210d812845b42e980cf93727a7

ARG RUNNER_VERSION="2.336.0"
ARG RUNNER_SHA256=58b758e420b87093fbd4bfddd368074960053e2f1388f01848c82624b90f27d1

ARG CLOUDWATCH_AGENT_VERSION=1.300071.0b1720

# S6 overlay is pinned and verified before it is copied into the runtime image.
ARG S6_OVERLAY_VERSION="3.2.3.2"
ARG S6_OVERLAY_NOARCH_SHA256=5379750ed30a84bbd2e2dd74847ba6b5bd29cd0b2e3ea2ec58049b57eb2eda12
ARG S6_OVERLAY_AARCH64_SHA256=b17f17a82e7a515c682a91edaf2ffdabb73f891981b6c1fd712115693a2f8b4c

# These packages are used only while assembling the runtime payload.
# hadolint ignore=DL3008,DL3015
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        tar \
        unzip \
        xz-utils \
    && rm -rf /var/lib/apt/lists/*

RUN install -d -m 0755 \
        /export/usr/local/aws-cli \
        /export/usr/local/bin \
        /export/opt/actions-runner \
        /export/opt/microvm \
        /export/run/amazon \
        /export/s6 \
    && curl --fail --location --show-error --silent \
        "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-arm64-${RUNNER_VERSION}.tar.gz" \
        --output /tmp/actions-runner.tar.gz \
    && printf '%s  %s\n' "${RUNNER_SHA256}" /tmp/actions-runner.tar.gz | sha256sum --check --strict \
    && tar --extract --gzip --no-same-owner --file /tmp/actions-runner.tar.gz \
        --directory /export/opt/actions-runner \
    && test -x /export/opt/actions-runner/externals/node24/bin/node \
    && rm -f /tmp/actions-runner.tar.gz

RUN curl --fail --location --show-error --silent \
        "https://amazoncloudwatch-agent.s3.amazonaws.com/ubuntu/arm64/${CLOUDWATCH_AGENT_VERSION}/amazon-cloudwatch-agent.deb" \
        --output /tmp/amazon-cloudwatch-agent.deb \
    && install -d -m 0755 /tmp/cloudwatch-agent-root \
    && dpkg-deb --extract /tmp/amazon-cloudwatch-agent.deb /tmp/cloudwatch-agent-root \
    && test "$(cat /tmp/cloudwatch-agent-root/opt/aws/amazon-cloudwatch-agent/bin/CWAGENT_VERSION)" \
        = "${CLOUDWATCH_AGENT_VERSION}" \
    && install -d -m 0755 /tmp/cloudwatch-agent-root/run/amazon \
    && mv /tmp/cloudwatch-agent-root/var/run/amazon/amazon-cloudwatch-agent \
        /tmp/cloudwatch-agent-root/run/amazon/ \
    && rmdir /tmp/cloudwatch-agent-root/var/run/amazon /tmp/cloudwatch-agent-root/var/run \
    && cp -a /tmp/cloudwatch-agent-root/. /export/ \
    && rm -f /tmp/amazon-cloudwatch-agent.deb \
    && rm -rf /tmp/cloudwatch-agent-root /export/etc/init /export/etc/systemd

RUN curl --fail --location --show-error --silent \
        "https://awscli.amazonaws.com/awscli-exe-linux-aarch64-${AWS_CLI_VERSION}.zip" \
        --output /tmp/awscliv2.zip \
    && printf '%s  %s\n' "${AWS_CLI_SHA256}" /tmp/awscliv2.zip | sha256sum --check --strict \
    && unzip -q /tmp/awscliv2.zip -d /tmp \
    && /tmp/aws/install \
        --install-dir /export/usr/local/aws-cli \
        --bin-dir /export/usr/local/bin \
    && rm -f /export/usr/local/bin/aws /export/usr/local/bin/aws_completer \
    && ln -s ../aws-cli/v2/current/bin/aws /export/usr/local/bin/aws \
    && ln -s ../aws-cli/v2/current/bin/aws_completer /export/usr/local/bin/aws_completer \
    && rm -rf /tmp/aws /tmp/awscliv2.zip

RUN curl --fail --location --show-error --silent \
        "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz" \
        --output /tmp/s6-overlay-noarch.tar.xz \
    && curl --fail --location --show-error --silent \
        "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-aarch64.tar.xz" \
        --output /tmp/s6-overlay-aarch64.tar.xz \
    && printf '%s  %s\n' "${S6_OVERLAY_NOARCH_SHA256}" \
        /tmp/s6-overlay-noarch.tar.xz | sha256sum --check --strict \
    && printf '%s  %s\n' "${S6_OVERLAY_AARCH64_SHA256}" \
        /tmp/s6-overlay-aarch64.tar.xz | sha256sum --check --strict \
    && tar --extract --xz --preserve-permissions --file /tmp/s6-overlay-noarch.tar.xz \
        --directory /export \
    && tar --extract --xz --preserve-permissions --file /tmp/s6-overlay-aarch64.tar.xz \
        --directory /export \
    && rm -f /tmp/s6-overlay-noarch.tar.xz /tmp/s6-overlay-aarch64.tar.xz

COPY lifecycle-hook.zip /tmp/lifecycle-hook.zip
RUN unzip -q /tmp/lifecycle-hook.zip -d /export/opt/microvm \
    && test -r /export/opt/microvm/server.js \
    && rm -f /tmp/lifecycle-hook.zip

FROM ${UBUNTU_IMAGE}

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# These are the Actions runner runtime dependencies. Keep the list aligned
# with the runner's supported Ubuntu dependencies.
# hadolint ignore=DL3008,DL3015
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates \
        git \
        jq \
        libicu74 \
        libkrb5-3 \
        liblttng-ust1t64 \
        libssl3t64 \
        zlib1g \
    && rm -rf /var/lib/apt/lists/*

COPY --from=tooling /export/ /

RUN existing_group="$(getent group 1000 | cut -d: -f1)" \
    && if [ -n "${existing_group}" ]; then \
        groupmod --new-name runner "${existing_group}"; \
    else \
        groupadd --gid 1000 runner; \
    fi \
    && existing_user="$(getent passwd 1000 | cut -d: -f1)" \
    && if [ -n "${existing_user}" ]; then \
        usermod --login runner --home /home/runner --move-home \
            --shell /bin/bash "${existing_user}"; \
    else \
        useradd --create-home --home-dir /home/runner --shell /bin/bash \
            --uid 1000 --gid 1000 runner; \
    fi \
    && install -d -m 0755 /opt/microvm /etc/services.d/cloudwatch-agent /var/log/microvm \
    && install -m 0600 /dev/null /var/log/microvm/internal-services.log \
    && install -m 0600 /dev/null /var/log/microvm/run.log \
    && chown -R runner:runner /home/runner /opt/actions-runner

COPY --chmod=0555 image-entrypoint.sh /opt/microvm/image-entrypoint.sh
COPY --chmod=0555 start-services.sh /opt/microvm/start-services.sh
COPY --chmod=0755 services/cloudwatch-agent.sh /etc/services.d/cloudwatch-agent/run
RUN touch /etc/services.d/cloudwatch-agent/down \
    && chmod 0644 /etc/services.d/cloudwatch-agent/down

ENV ACTIONS_RUNNER_ROOT="/opt/actions-runner" \
    AGENT_TOOLSDIRECTORY="/opt/hostedtoolcache" \
    HOME="/home/runner" \
    HOOK_PORT="8080" \
    INTERNAL_SERVICES="/opt/microvm/start-services.sh" \
    MICROVM_HOOK_LOG_FILE="/var/log/microvm/run.log" \
    MICROVM_HOOK_NODE="/opt/actions-runner/externals/node24/bin/node" \
    MICROVM_HOOK_SERVER="/opt/microvm/server.js" \
    MICROVM_SERVICES="cloudwatch-agent" \
    RUN_HOOK_TIMEOUT_SECONDS="52" \
    RUNNER_CONFIG_POLL_SECONDS="2" \
    RUNNER_CONFIG_TIMEOUT_SECONDS="20" \
    RUNNER_GID="1000" \
    RUNNER_HOME="/home/runner" \
    RUNNER_LAUNCH_RESERVE_SECONDS="7" \
    RUNNER_ROOT="/opt/actions-runner" \
    RUNNER_UID="1000" \
    RUNNER_USER="runner" \
    RUNNER_TOOL_CACHE="/opt/hostedtoolcache" \
    RUNNER_TOOLSDIRECTORY="/opt/hostedtoolcache"

# The lifecycle hook owns the MicroVM control socket and log file.
# hadolint ignore=DL3002
USER 0
WORKDIR /opt/actions-runner
EXPOSE 8080
ENTRYPOINT ["/init"]
CMD ["/command/with-contenv", "/opt/microvm/image-entrypoint.sh"]
