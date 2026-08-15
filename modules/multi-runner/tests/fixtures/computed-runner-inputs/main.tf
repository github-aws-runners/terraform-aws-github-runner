# Keep the runner lane key, provider selection, and optional KMS scalar
# caller-known while passing apply-time ARNs through the configuration.
resource "random_id" "managed_policy" {
  byte_length = 4
}

module "multi_runner" {
  source = "../../.."

  aws_region  = "eu-west-1"
  prefix      = "computed-inputs"
  vpc_id      = "vpc-12345678"
  subnet_ids  = ["subnet-12345678"]
  kms_key_arn = "arn:aws:kms:eu-west-1:123456789012:key/generated-${random_id.managed_policy.hex}"

  github_app = {
    id             = "123456"
    key_base64     = "dGVzdA=="
    webhook_secret = "test-secret"
  }

  lambda_s3_bucket      = "lambda-artifacts"
  webhook_lambda_s3_key = "webhook.zip"
  runners_lambda_s3_key = "runners.zip"
  syncer_lambda_s3_key  = "runner-binaries-syncer.zip"

  experimental = {
    github = {
      app = {
        id             = "123456"
        key_base64     = "dGVzdA=="
        webhook_secret = "test-secret"
      }
    }

    lambda = {
      artifact = {
        s3 = {
          bucket = "nested-lambda-artifacts"
        }
      }
      scale = {
        artifact = {
          s3 = {
            key = "nested-runners.zip"
          }
        }
      }
      webhook = {
        artifact = {
          s3 = {
            key = "webhook.zip"
          }
        }
      }
    }

    compute_provider = {
      ec2 = {
        vpc_id     = "vpc-nested-12345678"
        subnet_ids = ["subnet-nested-12345678"]
      }
    }

    ssm = {
      kms_key_id = "arn:aws:kms:eu-west-1:123456789012:key/generated-${random_id.managed_policy.hex}"
    }

    multi_runner_config = {
      linux = {
        runner = {
          os            = "linux"
          architecture  = "x64"
          maximum_count = 2
          iam = {
            managed_policy_arns = {
              generated = "arn:aws:iam::123456789012:policy/generated-${random_id.managed_policy.hex}"
            }
          }
        }
        orchestration = {
          webhook = {
            matcherConfig = {
              labelMatchers = [["self-hosted", "linux", "x64"]]
            }
          }
        }
        compute_provider = {
          ec2 = {
            instance_types = ["m5.large"]
            binaries_syncer = {
              enabled = false
            }
          }
        }
      }
    }
  }
}

output "runner_stack_keys" {
  value = keys(module.multi_runner.runners_map_v2)
}

output "binaries_syncer_keys" {
  value = keys(module.multi_runner.binaries_syncer_map)
}
