module "base" {
  source = "../base"

  prefix     = var.environment
  aws_region = var.aws_region
}

module "runners" {
  source = "../../modules/multi-runner"

  prefix     = var.environment
  aws_region = var.aws_region

  experimental_features = ["multi-runner-v2"]

  global_config = {
    tags = {
      Example = var.environment
      Project = "MiniStack"
    }
    runner = {
      os           = "linux"
      architecture = "x64"
    }
  }

  global_config_github = {
    app = {
      key_base64     = var.github_app.key_base64
      id             = var.github_app.id
      webhook_secret = var.github_app.webhook_secret
    }
    enterprise_server = var.github_enterprise_server
  }

  global_config_lambda = {
    architecture = "x86_64"
  }

  global_config_observability = {
    logs = {
      level = "debug"
    }
  }

  global_config_orchestration_provider = {
    webhook = {
      runner = {
        ephemeral          = true
        jit_config_enabled = true
        # The smoke test keeps the ephemeral resources alive until each provider's
        # scale-down phase, so it needs capacity for standard, dynamic, and pool runners.
        maximum_count        = 3
        boot_time_in_minutes = 0
      }
      lambda = {
        artifact = {
          zip = var.runners_lambda_zip
        }
        scale = {
          up = {
            job_queued_check_enabled = true
          }
          down = {
            # Smoke scenarios create and remove runners immediately; do not
            # wait for the Linux five-minute minimum runtime before checking
            # the GitHub runner state.
            minimum_running_time_in_minutes = 0
          }
        }
        pool = {
          config = [{
            schedule_expression          = "cron(0 0 1 1 ? 2099)"
            schedule_expression_timezone = "UTC"
            size                         = 1
          }]
          runner_owner = "test-owner"
        }
        webhook = {
          artifact = {
            zip = var.webhook_lambda_zip
          }
        }
      }
    }
  }

  global_config_storage_provider = {
    aws = {
      ssm = {
        paths = {
          root = "/github-action-runners/${var.environment}"
        }
      }
    }
  }

  global_config_compute_provider = {
    aws = {
      ec2 = {
        vpc_id      = module.base.vpc.vpc_id
        subnet_ids  = module.base.vpc.private_subnets
        ssm_enabled = true
        binaries_syncer = {
          enabled = false
        }
      }
      microvm = {
        image_arn                  = var.compute_provider.aws.microvm.image_arn
        image_version              = var.compute_provider.aws.microvm.image_version
        ingress_network_connectors = var.compute_provider.aws.microvm.ingress_network_connectors
        egress_network_connectors  = var.compute_provider.aws.microvm.egress_network_connectors
      }
    }
  }

  multi_runner_config = {
    ec2 = {
      runner = {
        os           = "linux"
        architecture = "x64"
        name_prefix  = "ec2-"
        extra_labels = ["ec2"]
      }
      orchestration_provider = {
        webhook = {
          github = {
            organization_runners = true
          }
          matcherConfig = {
            labelMatchers           = [["self-hosted", "linux", "x64", "ec2"]]
            bidirectionalLabelMatch = true
            dynamic_labels_enabled  = true
            awsDynamicLabelsPolicy = {
              restricted_keys = {
                "instance-type" = { allowed = ["m5.*"] }
              }
            }
          }
        }
      }
      compute_provider = {
        aws = {
          ec2 = {
            instance_types = var.compute_provider.aws.ec2.instance_types
            ami            = var.compute_provider.aws.ec2.ami
          }
        }
      }
    }

    microvm = {
      runner = {
        os           = "linux"
        architecture = "arm64"
        name_prefix  = "microvm-"
        extra_labels = ["microvm"]
      }
      orchestration_provider = {
        webhook = {
          github = {
            organization_runners = true
          }
          matcherConfig = {
            labelMatchers           = [["self-hosted", "linux", "arm64", "microvm"]]
            bidirectionalLabelMatch = true
            dynamic_labels_enabled  = true
            awsDynamicLabelsPolicy = {
              restricted_keys = {
                "image-version" = { allowed = ["3.0"] }
              }
            }
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
