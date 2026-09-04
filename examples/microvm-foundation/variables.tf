variable "aws_profile" {
  type        = string
  description = "Optional local AWS CLI profile. Leave null when credentials are provided by the environment or role."
  default     = null
  nullable    = true
}

variable "aws_region" {
  type        = string
  description = "AWS region in which to create the MicroVM foundation."
  default     = "eu-west-1"
}

variable "tags" {
  type        = map(string)
  description = "Additional tags applied by the foundation module."
  default = {
    Component = "microvm-foundation"
  }
}

variable "build_policy_name_prefix" {
  type        = string
  description = "Name prefix for the Lambda MicroVM build policy."
  default     = "github-actions-runner-microvm-build-policy-"
}

variable "usage_policy_name_prefix" {
  type        = string
  description = "Name prefix for the Lambda MicroVM runtime usage policy."
  default     = "github-actions-runner-microvm-runtime-usage-policy-"
}

variable "build_role_name_prefix" {
  type        = string
  description = "Name prefix for the Lambda MicroVM build role."
  default     = "github-actions-runner-microvm-build-"
}

variable "network_connector_operator_role_name_prefix" {
  type        = string
  description = "Name prefix for the Lambda Network Connector operator role."
  default     = "github-actions-runner-microvm-network-operator-"
}

variable "artifact_bucket_name" {
  type        = string
  description = "Optional globally unique S3 bucket name. When null, AWS generates the bucket name."
  default     = null
  nullable    = true
}

variable "artifact_retention_days" {
  type        = number
  description = "Number of days to retain current and noncurrent build artifacts."
  default     = 30
}

variable "image_name_prefix" {
  type        = string
  description = "Reserved Lambda MicroVM image-name namespace used by the runtime policy."
  default     = "github-actions-runner-ubuntu-arm64"
}

variable "ecr_repository_arns" {
  type        = set(string)
  description = "Optional private ECR repository ARNs used by the image build."
  default     = []
}

variable "network_connectors" {
  type = map(object({
    name             = string
    vpc_id           = string
    subnet_ids       = set(string)
    network_protocol = optional(string, "IPv4")
  }))
  description = "VPC and subnet configuration for regional Lambda MicroVM egress connectors."
}
