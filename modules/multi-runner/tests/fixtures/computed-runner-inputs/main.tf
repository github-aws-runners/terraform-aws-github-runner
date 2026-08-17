# Keep the runner-configuration key, provider selection, and optional KMS scalar
# caller-known while passing apply-time ARNs through the configuration.
resource "random_id" "managed_policy" {
  byte_length = 4
}

variable "enable_runner_binaries_syncer" {
  type    = bool
  default = false
}

variable "runner_binary_targets" {
  type = map(object({
    os           = string
    architecture = string
  }))
  default = {}
}

module "multi_runner" {
  source = "../../.."

  aws_region  = "eu-west-1"
  prefix      = "computed-inputs"
  kms_key_arn = "arn:aws:kms:eu-west-1:123456789012:key/generated-${random_id.managed_policy.hex}"

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
    }

    orchestration_provider = {
      webhook = {
        queue = {
          encryption = {
            kms_data_key_reuse_period_seconds = 300
            kms_master_key_id                 = "arn:aws:kms:eu-west-1:123456789012:key/generated-${random_id.managed_policy.hex}"
            sqs_managed_sse_enabled           = null
          }
        }

        lambda = {
          artifact = {
            s3 = {
              key = "nested-runners.zip"
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
      }
    }

    compute_provider = {
      selections = {
        linux = {
          namespace = "aws"
          type      = "ec2"
        }
        micro = {
          namespace = "aws"
          type      = "microvm"
        }
      }
      aws = {
        ec2 = {
          vpc_id     = "vpc-nested-12345678"
          subnet_ids = ["subnet-nested-12345678"]
          runner_binaries = {
            targets = var.runner_binary_targets
            syncer = {
              artifact = {
                s3 = {
                  key = "runner-binaries-syncer.zip"
                }
              }
            }
          }
        }
        microvm = {
          image_arn = "arn:aws:lambda:eu-west-1:123456789012:microvm-image:computed-${random_id.managed_policy.hex}"
          iam = {
            managed_policies = {
              scale_up = {
                arn = "arn:aws:iam::123456789012:policy/computed-microvm-scale-up-${random_id.managed_policy.hex}"
              }
              pool = {
                arn = "arn:aws:iam::123456789012:policy/computed-microvm-pool-${random_id.managed_policy.hex}"
              }
            }
          }
        }
      }
    }

    ssm = {
      kms_key_id = "arn:aws:kms:eu-west-1:123456789012:key/generated-${random_id.managed_policy.hex}"
      housekeeper = {
        lambda = {
          artifact = {
            s3 = {
              key = "nested-ssm-housekeeper.zip"
            }
          }
        }
      }
    }

    multi_runner_config = {
      linux = {
        runner = {
          os           = "linux"
          architecture = "x64"
          iam = {
            managed_policy_arns = {
              generated = "arn:aws:iam::123456789012:policy/generated-${random_id.managed_policy.hex}"
            }
          }
        }
        orchestration_provider = {
          webhook = {
            runner = {
              maximum_count = 2
            }

            matcherConfig = {
              labelMatchers = [["self-hosted", "linux", "x64"]]
            }
          }
        }
        compute_provider = {
          aws = {
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = var.enable_runner_binaries_syncer
              }
            }
          }
        }
      }
      micro = {
        runner = {
          os           = "linux"
          architecture = "arm64"
        }
        orchestration_provider = {
          webhook = {
            runner = {
              ephemeral     = true
              maximum_count = 2
            }

            matcherConfig = {
              labelMatchers = [["self-hosted", "linux", "arm64", "microvm"]]
            }
          }
        }
        compute_provider = {
          aws = {
            microvm = {}
          }
        }
      }
    }
  }
}

output "runner_config_keys" {
  value = keys(module.multi_runner.runners_map_v2)
}

output "binaries_syncer_keys" {
  value = keys(module.multi_runner.binaries_syncer_map)
}
