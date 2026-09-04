locals {
  environment = coalesce(var.environment, "microvm")
  aws_region  = var.aws_region
}

module "base" {
  source = "../base"

  prefix     = local.environment
  aws_region = local.aws_region
}

module "runners" {
  source = "../../modules/multi-runner"

  aws_region = local.aws_region
  vpc_id     = module.base.vpc.vpc_id
  subnet_ids = module.base.vpc.private_subnets
  prefix     = local.environment

  # Required for backwards-compatible module input validation; the non-empty
  # experimental map selects the MicroVM configuration below.
  multi_runner_config = {}

  # Keep GitHub App credentials in pre-created SSM parameters. This example
  # therefore does not place the private key or webhook secret in Terraform
  # configuration or state.
  github_app = var.github_app

  experimental_global_config_github = {
    app = var.github_app
  }

  experimental_global_config_lambda = {
    artifact = {
      s3 = {
        bucket = var.lambda_artifact_bucket
      }
    }
  }

  experimental_global_config_orchestration_provider = {
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

  experimental_global_config_ssm = {
    paths = {
      root = "/github-action-runners/${local.environment}"
    }
  }

  experimental_global_config_compute_provider = {
    aws = {
      microvm = {
        image_arn                  = var.microvm_image_arn
        image_version              = var.microvm_image_version
        ingress_network_connectors = var.ingress_network_connector_arns
        egress_network_connectors  = [var.egress_network_connector_arn]
      }
    }
  }

  experimental_multi_runner_config = {
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
