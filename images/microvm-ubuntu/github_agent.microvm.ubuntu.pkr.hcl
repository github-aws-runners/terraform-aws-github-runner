# Lambda, rather than Packer, owns the MicroVM image build. This single
# pseudo-Packer target provides the same build interface as the AMI pipelines
# while delegating packaging, regional publication, and polling to boto3.
# The null builder and shell-local provisioner are Packer built-ins, so this
# template intentionally has no required_plugins entry for them.

variable "aws_data_path" {
  description = "Botocore data path containing the Lambda MicroVM service model."
  type        = string
  default     = env("AWS_DATA_PATH")
}

variable "aws_region" {
  description = "AWS Region for the S3 artifact, Ubuntu ECR mirror, and Lambda MicroVM image."
  type        = string
  default     = env("AWS_REGION")
}

variable "artifact_bucket" {
  description = "S3 artifact bucket. Lambda MicroVMs requires this bucket to be in aws_region."
  type        = string
  default     = env("MICROVM_ARTIFACT_BUCKET")
}

variable "build_role_arn" {
  description = "IAM role assumed by Lambda while it builds the MicroVM image."
  type        = string
  default     = env("MICROVM_BUILD_ROLE_ARN")
}

variable "egress_network_connector_arn" {
  description = "ARN of the regional Lambda Network Connector used for image-build egress."
  type        = string
  default     = env("MICROVM_EGRESS_NETWORK_CONNECTOR_ARN")
}

variable "image_name" {
  description = "Name of the customer Lambda MicroVM image."
  type        = string
  default     = env("MICROVM_IMAGE_NAME")
}

variable "idempotency_nonce" {
  description = "Per-attempt nonce that permits a workflow rerun to replace an asynchronously failed build."
  type        = string
  default     = env("MICROVM_IDEMPOTENCY_NONCE")
}

variable "lifecycle_hook_zip" {
  description = "ZIP containing the compiled lifecycle-hook server.js at the archive root."
  type        = string
  default     = env("MICROVM_LIFECYCLE_HOOK_ZIP")
}

variable "log_group" {
  description = "CloudWatch Logs group for the Lambda MicroVM image build."
  type        = string
  default     = env("MICROVM_LOG_GROUP")
}

variable "memory_mib" {
  description = "MicroVM memory tier in MiB. The complete runner image currently requires the 8192 MiB tier's 32 GiB disk."
  type        = string
  default     = env("MICROVM_MEMORY_MIB")
}

variable "output_dir" {
  description = "Directory for deterministic build artifacts and publication manifests."
  type        = string
  default     = env("MICROVM_OUTPUT_DIR")
}

variable "release_version" {
  description = "Stable or prerelease version recorded in MicroVM metadata."
  type        = string
  default     = env("MICROVM_RELEASE_VERSION")
}

variable "ubuntu_image" {
  description = "Regional private ECR mirror used for the Ubuntu 24.04 Dockerfile stages."
  type        = string
  default     = env("MICROVM_UBUNTU_IMAGE")
}

source "null" "lambda_microvm" {
  communicator = "none"
}

build {
  name = "lambda-microvm-image"
  sources = [
    "source.null.lambda_microvm"
  ]

  provisioner "shell-local" {
    # MICROVM_ENVIRONMENT_VARIABLES is inherited from the build step. Do not
    # add it here: shell-local renders environment_vars into the shell argv.
    environment_vars = [
      "AWS_DATA_PATH=${var.aws_data_path}",
      "AWS_REGION=${var.aws_region}",
      "MICROVM_ARTIFACT_BUCKET=${var.artifact_bucket}",
      "MICROVM_BUILD_ROLE_ARN=${var.build_role_arn}",
      "MICROVM_EGRESS_NETWORK_CONNECTOR_ARN=${var.egress_network_connector_arn}",
      "MICROVM_IMAGE_NAME=${var.image_name}",
      "MICROVM_IDEMPOTENCY_NONCE=${var.idempotency_nonce}",
      "MICROVM_LIFECYCLE_HOOK_ZIP=${var.lifecycle_hook_zip}",
      "MICROVM_LOG_GROUP=${var.log_group}",
      "MICROVM_MEMORY_MIB=${var.memory_mib}",
      "MICROVM_OUTPUT_DIR=${var.output_dir}",
      "MICROVM_RELEASE_VERSION=${var.release_version}",
      "MICROVM_UBUNTU_IMAGE=${var.ubuntu_image}",
      "PYTHONDONTWRITEBYTECODE=1",
      "PYTHONUNBUFFERED=1",
    ]
    script  = "packer/scripts/microvm/build-microvm-image.py"
    timeout = "90m"
  }
}
