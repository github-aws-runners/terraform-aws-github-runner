terraform {
  required_version = ">= 1.10.0"

  required_providers {
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "= 6.35.1"
    }
  }
}

provider "aws" {
  region = "eu-west-1"

  # These values are MiniStack test identifiers and cannot authenticate to AWS.
  access_key = "000000000000"
  secret_key = "ministack-test-only"

  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_region_validation      = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true
}

variable "lambda_archive_path" {
  description = "Path where the inert Lambda archive is created."
  type        = string
  default     = null
}

locals {
  lambda_archive_path = var.lambda_archive_path != null ? var.lambda_archive_path : "${path.module}/.terraform/ministack/lambda.zip"
}

data "archive_file" "lambda" {
  type        = "zip"
  source_file = "${path.module}/index.mjs"
  output_path = local.lambda_archive_path
}

resource "aws_ssm_parameter" "al2023_x64" {
  name  = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64"
  type  = "String"
  value = "ami-0abcdef1234567890"
}

resource "aws_ssm_parameter" "al2023_arm64" {
  name  = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-arm64"
  type  = "String"
  value = "ami-0abcdef1234567890"
}

resource "aws_ssm_parameter" "github_app_id" {
  name  = "/ministack/terraform-aws-github-runner/github-app/id"
  type  = "String"
  value = "0"
}

resource "aws_ssm_parameter" "github_app_key" {
  name  = "/ministack/terraform-aws-github-runner/github-app/key-base64"
  type  = "SecureString"
  value = "ministack-invalid-github-app-key"
}

resource "aws_ssm_parameter" "github_app_webhook_secret" {
  name  = "/ministack/terraform-aws-github-runner/github-app/webhook-secret"
  type  = "SecureString"
  value = "ministack-test-only"
}

output "lambda_archive" {
  description = "Absolute path to the inert Lambda archive used by the example tests."
  value       = abspath(data.archive_file.lambda.output_path)
}
