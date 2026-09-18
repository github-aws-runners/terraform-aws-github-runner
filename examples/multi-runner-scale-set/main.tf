locals {
  environment = var.environment
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

  experimental_features = ["multi-runner-v2"]

  global_config = {
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

  global_config_github = {
    app = {
      key_base64      = var.github_app.key_base64
      id              = var.github_app.id
      installation_id = var.github_app.installation_id
      webhook_secret  = random_id.random.hex
    }
    runner_registration_level = var.github_config.runner_registration_level
    runner_owner              = var.github_config.runner_owner
  }

  global_config_lambda = {
    architecture = "arm64"
  }

  global_config_orchestration_provider = {
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
      container = var.scale_set.container
      network = {
        vpc_id     = module.base.vpc.vpc_id
        subnet_ids = module.base.vpc.private_subnets
      }
    }
  }

  global_config_compute_provider = {
    aws = {
      ec2 = {
        vpc_id      = module.base.vpc.vpc_id
        subnet_ids  = module.base.vpc.private_subnets
        ssm_enabled = true
        runner_binaries = {
          enabled = var.runner_binaries_enabled
        }
      }
    }
  }

  multi_runner_config = {
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
            ami            = lookup(var.ami, "linux-arm64", null)
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
            ami            = lookup(var.ami, "linux-x64", null)
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
          name = var.scale_set.name
          runner = {
            min_runners          = 0
            max_runners          = 10
            boot_time_in_minutes = 10
          }
        }
      }
      compute_provider = {
        aws = {
          ec2 = {
            instance_types = ["m5.large"]
            ami            = lookup(var.ami, "linux-scale-set", null)
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
            ami            = lookup(var.ami, "windows-x64", null)
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
