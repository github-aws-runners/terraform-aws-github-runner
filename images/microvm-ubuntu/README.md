# Lambda MicroVM image build

This directory contains the complete Lambda MicroVM image build inputs adapted
from the companion base-image repository: the Packer template, pinned ARM64
Dockerfile, compiled lifecycle-hook ZIP contract, and image entrypoint.

Before building the image:

1. Apply `examples/microvm-foundation` in the target AWS Region.
2. Install Packer and set the required AWS, S3, IAM, connector, and
   lifecycle-hook variables.

The image intentionally excludes the source repository's optional external
telemetry and Teleport services. It contains only the Actions runner,
CloudWatch Agent, and lifecycle-hook server; no credentials are stored in the
image source.

The `github_agent.microvm.ubuntu.pkr.hcl` template packages a deterministic
artifact, resolves the Ubuntu ECR mirror to a digest, uploads the artifact to
the regional S3 bucket, and waits for the Lambda MicroVM image version to
become active.

```bash
export AWS_REGION="<aws-region>"
export AWS_DATA_PATH="<path-to-botocore-data>"
export MICROVM_ARTIFACT_BUCKET="<artifact-bucket-name>"
export MICROVM_BUILD_ROLE_ARN="<build-role-arn>"
export MICROVM_EGRESS_NETWORK_CONNECTOR_ARN="<egress-network-connector-arn>"
export MICROVM_IMAGE_NAME="<microvm-image-name>"
export MICROVM_LIFECYCLE_HOOK_ZIP="<path-to-lifecycle-hook.zip>"
export MICROVM_LOG_GROUP="<cloudwatch-log-group>"
export MICROVM_MEMORY_MIB=8192
export MICROVM_UBUNTU_IMAGE="<regional-ubuntu-ecr-image>"
export MICROVM_IDEMPOTENCY_NONCE="$(date -u +%Y%m%dT%H%M%SZ)"

packer init .
packer fmt -check=true github_agent.microvm.ubuntu.pkr.hcl
packer validate -evaluate-datasources github_agent.microvm.ubuntu.pkr.hcl
packer build -color=false github_agent.microvm.ubuntu.pkr.hcl
```

The build role, artifact bucket, and network connector are created by the
foundation module. Keep the bucket private and versioned, use the module's
least-privilege policies, and do not put credentials in checked-in files. The
lifecycle-hook ZIP must contain the compiled `server.js` at its archive root;
any bundled dependencies must use safe relative paths.
