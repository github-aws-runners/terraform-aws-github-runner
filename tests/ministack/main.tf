terraform {
  required_version = ">= 1.10.0"

  required_providers {
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.33"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }
}

variable "ministack_endpoint" {
  description = "HTTP endpoint for the local MiniStack instance."
  type        = string
  default     = "http://127.0.0.1:4566"

  validation {
    condition = contains([
      "http://127.0.0.1:4566",
      "http://localhost:4566",
      "http://ministack:4566",
    ], var.ministack_endpoint)
    error_message = "The MiniStack endpoint must use port 4566 on the local host or the CI service hostname."
  }
}

provider "aws" {
  access_key                  = "000000000000"
  region                      = "eu-west-1"
  secret_key                  = sha256("ministack:${var.ministack_endpoint}")
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  endpoints {
    iam    = var.ministack_endpoint
    lambda = var.ministack_endpoint
    logs   = var.ministack_endpoint
    ssm    = var.ministack_endpoint
    sts    = var.ministack_endpoint
  }
}

data "aws_caller_identity" "ministack" {}

data "archive_file" "lambda" {
  type        = "zip"
  output_path = "${path.root}/.terraform/ministack-lambda.zip"

  source {
    content  = "exports.handler = async () => ({ statusCode: 200, body: 'ok' });"
    filename = "index.js"
  }
}

resource "random_password" "github_app_key" {
  length  = 64
  special = false
}

resource "random_password" "github_webhook_secret" {
  length  = 32
  special = false
}

resource "random_password" "additional_github_app_key" {
  length  = 64
  special = false
}

module "ssm" {
  source = "../../modules/ssm"

  path_prefix = "/ministack/terraform-aws-github-runner"
  github_app = {
    id             = "ministack-primary-app"
    key_base64     = base64encode(random_password.github_app_key.result)
    webhook_secret = random_password.github_webhook_secret.result
  }
  additional_github_apps = [{
    id              = "ministack-additional-app"
    key_base64      = base64encode(random_password.additional_github_app_key.result)
    installation_id = "ministack-installation"
  }]
  tags = {
    Test = "ministack"
  }
}

module "setup_iam_permissions" {
  source = "../../modules/setup-iam-permissions"

  prefix     = "ministack-test"
  account_id = data.aws_caller_identity.ministack.account_id
  namespaces = {
    boundary_namespace         = "ministack-boundaries"
    instance_profile_namespace = "ministack-instance-profiles"
    policy_namespace           = "ministack-policies"
    role_namespace             = "ministack-roles"
  }
}

module "lambda" {
  source = "../../modules/lambda"

  lambda = {
    architecture              = "x86_64"
    handler                   = "index.handler"
    logging_retention_in_days = 1
    name                      = "api-compatibility"
    prefix                    = "ministack-test"
    runtime                   = "nodejs22.x"
    tags = {
      Test = "ministack"
    }
    zip = data.archive_file.lambda.output_path
  }
}

output "applied_resources" {
  description = "Representative resources created through the MiniStack AWS API."
  value = {
    caller_account_id   = data.aws_caller_identity.ministack.account_id
    deployment_boundary = module.setup_iam_permissions.boundary
    deployment_role     = module.setup_iam_permissions.role
    lambda_arn          = module.lambda.lambda.function.arn
    lambda_log_group    = module.lambda.lambda.log_group.arn
    ssm_parameters      = module.ssm.parameters
  }
}
