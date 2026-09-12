locals {
  environment = var.environment
  ami = {
    filter = {
      name  = ["migration-test-linux"]
      state = ["available"]
    }
    owners = ["self"]
  }

  pool_config = [{
    schedule_expression          = "cron(0 0 * * ? *)"
    schedule_expression_timezone = "UTC"
    size                         = 1
  }]

  multi_runner_config = {
    large = {
      runner = {
        os                     = "linux"
        architecture           = "x64"
        name_prefix            = "migration-"
        extra_labels           = ["migration"]
        group_name             = "migration"
        disable_default_labels = false
        run_as_root            = false
        run_as                 = "ec2-user"
        auto_update_disabled   = false
      }
      orchestration_provider = {
        webhook = {
          runner = {
            boot_time_in_minutes = 5
            ephemeral            = true
            jit_config_enabled   = true
            maximum_count        = 2
          }
          matcherConfig = {
            exactMatch    = false
            labelMatchers = [["self-hosted", "linux", "x64", "migration"]]
            priority      = 10
          }
          queue = {
            delay_webhook_event            = 5
            job_queue_retention_in_seconds = 86400
            visibility_timeout_seconds     = 45
          }
          lambda = {
            scale = {
              up = {
                memory_size                    = 768
                timeout                        = 45
                reserved_concurrent_executions = 1
                job_queued_check_enabled       = true
                event_source_mapping = {
                  batch_size                         = 25
                  maximum_batching_window_in_seconds = 10
                }
              }
              down = {
                memory_size                     = 640
                timeout                         = 70
                schedule_expression             = "cron(* * * * ? *)"
                minimum_running_time_in_minutes = 1
                idle_confirmation_seconds       = 10
              }
            }
            pool = {
              timeout                        = 90
              reserved_concurrent_executions = 2
              config                         = local.pool_config
              runner_owner                   = "migration-test"
            }
          }
          job_retry = {
            enabled          = true
            delay_in_seconds = 60
            delay_backoff    = 2
            max_attempts     = 2
            lambda = {
              memory_size                    = 256
              reserved_concurrent_executions = -1
              timeout                        = 30
            }
          }
        }
      }
      compute_provider = {
        aws = {
          ec2 = {
            ami                             = local.ami
            instance_types                  = ["m5.large"]
            create_service_linked_role_spot = true
            ssm_enabled                     = true
            detailed_monitoring_enabled     = true
            binaries_syncer                 = { enabled = true }
            cloudwatch_agent = {
              enabled = true
              config  = "{\"metrics\":{}}"
            }
            metadata_options = {
              instance_metadata_tags      = "disabled"
              http_endpoint               = "enabled"
              http_tokens                 = "optional"
              http_put_response_hop_limit = 1
            }
            on_demand_failover_for_errors = ["InsufficientInstanceCapacity"]
          }
        }
      }
    }
  }
}

resource "random_id" "webhook_secret" {
  byte_length = 20
}

module "base" {
  source = "../../base"

  prefix     = local.environment
  aws_region = var.aws_region
}

module "runners" {
  source = "../../../modules/multi-runner"

  prefix     = local.environment
  aws_region = var.aws_region

  experimental_features = ["multi-runner-v2"]
  multi_runner_config   = local.multi_runner_config

  global_config = {
    tags = {
      Example = "migration-test"
      Feature = "state-migration"
    }
    runner = {
      os           = "linux"
      architecture = "x64"
    }
  }

  global_config_github = {
    app = {
      id             = var.github_app.id
      key_base64     = var.github_app.key_base64
      webhook_secret = random_id.webhook_secret.hex
    }
    additional_apps = [{
      id              = "1"
      key_base64      = "ministack-invalid-additional-key"
      installation_id = "2"
    }]
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
      lambda = {
        scale = {
          up = {
            memory_size = 768
            timeout     = 45
          }
          down = {
            memory_size = 640
            timeout     = 70
          }
        }
        webhook = {
          memory_size = 384
          timeout     = 20
        }
        pool = {
          memory_size = 512
          timeout     = 90
        }
      }
      queue = {
        visibility_timeout_seconds = 45
      }
    }
  }

  global_config_ssm = {
    paths = {
      root    = "/github-action-runners/migration-test"
      app     = "app"
      webhook = "webhook"
      tokens  = "runners/tokens"
      config  = "runners/config"
    }
    housekeeper = {
      schedule_expression = "rate(12 hours)"
      state               = "ENABLED"
      lambda = {
        memory_size = 640
        timeout     = 75
      }
      config = {
        minimumDaysOld = 3
        dryRun         = true
      }
    }
  }

  global_config_observability = {
    logs = {
      level             = "debug"
      retention_in_days = 30
      class             = "STANDARD"
    }
    tracing = {
      mode                  = "Active"
      capture_http_requests = true
      capture_error         = true
    }
    metrics = {
      enabled   = true
      namespace = "MigrationTest"
      metric = {
        github_app_rate_limit    = { enabled = true }
        job_retry                = { enabled = true }
        spot_termination_warning = { enabled = true }
      }
    }
  }

  global_config_compute_provider = {
    aws = {
      ec2 = {
        vpc_id     = module.base.vpc.vpc_id
        subnet_ids = module.base.vpc.private_subnets
        ami = {
          housekeeper = {
            enabled = true
            cleanup_config = {
              minimumDaysOld = 1
              dryRun         = true
              amiFilters = [{
                Name   = "name"
                Values = ["migration-test-*"]
              }]
            }
            lambda = {
              memory_size = 300
              timeout     = 120
            }
            schedule = {
              expression = "rate(1 day)"
            }
          }
        }
        instance_termination_watcher = {
          enabled = true
          features = {
            runner_deregistration                 = { enabled = true }
            spot_termination_handler              = { enabled = true }
            spot_termination_notification_watcher = { enabled = true }
          }
        }
        runner_binaries = {
          enabled = true
          syncer = {
            lambda = {
              memory_size = 256
              timeout     = 300
            }
            schedule = {
              expression = "cron(27 * * * ? *)"
              state      = "ENABLED"
            }
          }
        }
      }
    }
  }
}

module "webhook_github_app" {
  source     = "../../../modules/webhook-github-app"
  depends_on = [module.runners]

  github_app = {
    id             = var.github_app.id
    key_base64     = var.github_app.key_base64
    webhook_secret = random_id.webhook_secret.hex
  }
  webhook_endpoint = module.runners.webhook.endpoint
}
