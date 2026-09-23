locals {
  environment = coalesce(var.environment, "microvm")
  aws_region  = var.aws_region
}

module "base" {
  source = "../base"

  prefix     = local.environment
  aws_region = local.aws_region
}

resource "random_id" "random" {
  byte_length = 20
}

module "runners" {
  source = "../../modules/multi-runner"

  aws_region = local.aws_region
  prefix     = local.environment

  experimental_features = ["multi-runner-v2"]

  global_config_github = {
    app = {
      key_base64     = var.github_app.key_base64
      id             = var.github_app.id
      webhook_secret = random_id.random.hex
    }
  }

  global_config_lambda = {
    artifact = {
      s3 = {
        bucket = var.lambda_artifact_bucket
      }
    }
  }

  global_config_orchestration_provider = {
    webhook = {
      runner = {
        ephemeral            = true
        jit_config_enabled   = true
        maximum_count        = var.runners_maximum_count
        boot_time_in_minutes = 5
      }
      github = {
        organization_runners = var.organization_runners
      }
      lambda = {
        artifact = {
          s3 = {
            key = var.runners_lambda_s3_key
          }
        }
        webhook = {
          artifact = {
            s3 = {
              key = var.webhook_lambda_s3_key
            }
          }
        }
      }
    }
  }

  global_config_storage_provider = {
    aws = {
      ssm = {
        paths = {
          root = "/github-action-runners/${local.environment}"
        }
      }
    }
  }

  global_config_compute_provider = {
    aws = {
      microvm = {
        image_arn                  = var.microvm_image_arn
        image_version              = var.microvm_image_version
        ingress_network_connectors = var.ingress_network_connector_arns
        egress_network_connectors  = [var.egress_network_connector_arn]
      }
    }
  }

  multi_runner_config = {
    microvm = {
      runner = {
        os           = "linux"
        architecture = "arm64"
        name_prefix  = "microvm-"
        extra_labels = ["microvm"]
      }
      orchestration_provider = {
        webhook = {
          matcherConfig = {
            labelMatchers           = [["self-hosted", "linux", "arm64", "microvm"]]
            bidirectionalLabelMatch = true
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
