locals {
  environment = var.environment != null ? var.environment : "multi-runner-v2"
  aws_region  = var.aws_region
}

resource "random_id" "random" {
  byte_length = 20
}

module "base" {
  source = "../base"

  prefix     = local.environment
  aws_region = local.aws_region
}

module "runners" {
  source = "../../modules/multi-runner"

  prefix     = local.environment
  aws_region = local.aws_region

  experimental_global_config = {
    tags = {
      Example = local.environment
      Project = "ProjectX"
    }
    runner = {
      os           = "linux"
      architecture = "x64"
      extra_labels = ["v2"]
    }
  }

  experimental_global_config_github = {
    app = {
      key_base64     = var.github_app.key_base64
      id             = var.github_app.id
      webhook_secret = random_id.random.hex
    }
  }

  experimental_global_config_lambda = {
    architecture = "arm64"
  }

  experimental_global_config_orchestration_provider = {
    webhook = {
      eventbridge = {
        enabled       = true
        accept_events = ["workflow_job"]
      }
    }
    scale_set = {
      grouping = {
        strategy = "runner_config"
      }
      network = {
        vpc_id     = module.base.vpc.vpc_id
        subnet_ids = module.base.vpc.private_subnets
      }
    }
  }

  experimental_global_config_compute_provider = {
    aws = {
      ec2 = {
        vpc_id      = module.base.vpc.vpc_id
        subnet_ids  = module.base.vpc.private_subnets
        ssm_enabled = true
        runner_binaries = {
          enabled = true
        }
      }
    }
  }

  experimental_multi_runner_config = {
    linux-arm64 = {
      runner = {
        architecture = "arm64"
        name_prefix  = "amazon-arm64-"
        extra_labels = ["amazon"]
      }
      orchestration_provider = {
        webhook = {
          runner = {
            maximum_count = 1
          }
          matcherConfig = {
            exactMatch    = true
            labelMatchers = [["self-hosted", "linux", "arm64", "amazon"]]
          }
        }
      }
      compute_provider = {
        aws = {
          ec2 = {
            instance_types = ["t4g.large", "c6g.large"]
          }
        }
      }
    }

    linux-x64 = {
      runner = {
        name_prefix  = "amazon-x64-"
        extra_labels = ["amazon"]
      }
      orchestration_provider = {
        webhook = {
          runner = {
            ephemeral     = true
            maximum_count = 1
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64", "amazon"]]
            exactMatch    = false
            priority      = 1
          }
          queue = {
            delay_webhook_event = 0
          }
          job_retry = {
            enabled = true
          }
        }
      }
      compute_provider = {
        aws = {
          ec2 = {
            instance_types = ["m5a.large", "m5ad.large"]
          }
        }
      }
    }

    linux-scale-set = {
      runner = {
        name_prefix  = "scale-set-"
        extra_labels = ["scale-set"]
      }
      orchestration_provider = {
        scale_set = {
          github = {
            config_url          = var.scale_set.config_url
            installation_id_ssm = var.scale_set.installation_id_ssm
          }
          name            = var.scale_set.name
          id              = var.scale_set.id
          runner_group_id = var.scale_set.runner_group_id
          min_runners     = 0
          max_runners     = 10
          work_folder     = "_work/scale-set"
        }
      }
      compute_provider = {
        aws = {
          ec2 = {
            instance_types = ["m5.large"]
          }
        }
      }
    }

    windows-x64 = {
      runner = {
        os          = "windows"
        name_prefix = "windows-x64-"
      }
      orchestration_provider = {
        webhook = {
          runner = {
            boot_time_in_minutes = 20
            maximum_count        = 1
          }
          matcherConfig = {
            exactMatch    = true
            labelMatchers = [["self-hosted", "windows", "x64", "servercore-2022"]]
          }
        }
      }
      compute_provider = {
        aws = {
          ec2 = {
            instance_types = ["m5.large", "c5.large"]
            ami = {
              filter = {
                name  = ["Windows_Server-2022-English-Full-ECS_Optimized-*"]
                state = ["available"]
              }
            }
          }
        }
      }
    }
  }
}

module "webhook_github_app" {
  source     = "../../modules/webhook-github-app"
  depends_on = [module.runners]

  github_app = {
    key_base64     = var.github_app.key_base64
    id             = var.github_app.id
    webhook_secret = random_id.random.hex
  }
  webhook_endpoint = module.runners.webhook.endpoint
}
