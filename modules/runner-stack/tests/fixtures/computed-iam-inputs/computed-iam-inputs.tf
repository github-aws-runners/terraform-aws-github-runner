# Plan-time regression fixture for computed role, profile, and policy values.
resource "random_id" "external" {
  byte_length = 4
}

resource "random_id" "generated_policy" {
  byte_length = 4
}

module "external_iam" {
  source = "../../.."

  aws_region = "eu-west-1"
  prefix     = "computed-external"

  compute_provider = {
    type = "ec2"
    ec2 = {
      vpc_id         = "vpc-12345678"
      subnet_ids     = ["subnet-12345678"]
      instance_types = ["m5.large"]
      instance_profile = {
        name = "external-runner-${random_id.external.hex}"
      }
      enable_cloudwatch_agent       = false
      enable_runner_binaries_syncer = false
    }
  }

  runner_iam = {
    role = {
      arn = "arn:aws:iam::123456789012:role/external-runner-${random_id.external.hex}"
    }
  }

  sqs_build_queue = {
    arn = "arn:aws:sqs:eu-west-1:123456789012:computed-external"
    url = "https://sqs.eu-west-1.amazonaws.com/123456789012/computed-external"
  }

  enable_organization_runners = true
  runner_labels               = ["self-hosted", "linux", "x64"]

  lambda_s3_bucket      = "lambda-artifacts"
  runners_lambda_s3_key = "runners.zip"

  github_app_parameters = {
    key_base64 = {
      name = "/github-runner/key-base64"
      arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64"
    }
    id = {
      name = "/github-runner/app-id"
      arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id"
    }
  }

  ssm_paths = {
    root   = "/github-runner/computed-external"
    tokens = "tokens"
    config = "config"
  }
}

module "generated_policy" {
  source = "../../.."

  aws_region = "eu-west-1"
  prefix     = "computed-policy"

  compute_provider = {
    type = "ec2"
    ec2 = {
      vpc_id                        = "vpc-12345678"
      subnet_ids                    = ["subnet-12345678"]
      instance_types                = ["m5.large"]
      enable_cloudwatch_agent       = false
      enable_runner_binaries_syncer = false
    }
  }

  runner_iam = {
    managed_policy_arns = {
      generated = "arn:aws:iam::123456789012:policy/generated-runner-${random_id.generated_policy.hex}"
    }
  }

  sqs_build_queue = {
    arn = "arn:aws:sqs:eu-west-1:123456789012:computed-policy"
    url = "https://sqs.eu-west-1.amazonaws.com/123456789012/computed-policy"
  }

  enable_organization_runners = true
  runner_labels               = ["self-hosted", "linux", "x64"]

  lambda_s3_bucket      = "lambda-artifacts"
  runners_lambda_s3_key = "runners.zip"

  github_app_parameters = {
    key_base64 = {
      name = "/github-runner/key-base64"
      arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64"
    }
    id = {
      name = "/github-runner/app-id"
      arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id"
    }
  }

  ssm_paths = {
    root   = "/github-runner/computed-policy"
    tokens = "tokens"
    config = "config"
  }
}

output "external_role_runner_count" {
  value = length(module.external_iam.role_runner)
}

output "generated_policy_role_runner_count" {
  value = length(module.generated_policy.role_runner)
}
