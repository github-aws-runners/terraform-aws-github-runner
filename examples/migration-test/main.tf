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
      matcherConfig = {
        exactMatch    = false
        labelMatchers = [["self-hosted", "linux", "x64", "migration"]]
        priority      = 10
      }
      runner_config = {
        runner_os             = "linux"
        runner_architecture   = "x64"
        runner_name_prefix    = "migration-"
        runner_extra_labels   = ["migration"]
        runner_group_name     = "migration"
        instance_types        = ["m5.large"]
        runners_maximum_count = 2

        ami                                                            = local.ami
        create_service_linked_role_spot                                = true
        enable_ephemeral_runners                                       = true
        enable_jit_config                                              = true
        enable_job_queued_check                                        = true
        enable_on_demand_failover_for_errors                           = ["InsufficientInstanceCapacity"]
        enable_runner_binaries_syncer                                  = true
        enable_ssm_on_runners                                          = true
        enable_runner_detailed_monitoring                              = true
        enable_cloudwatch_agent                                        = true
        cloudwatch_config                                              = "{\"metrics\":{}}"
        delay_webhook_event                                            = 5
        scale_down_schedule_expression                                 = "cron(* * * * ? *)"
        minimum_running_time_in_minutes                                = 1
        scale_down_idle_confirmation_seconds                           = 10
        lambda_event_source_mapping_batch_size                         = 25
        lambda_event_source_mapping_maximum_batching_window_in_seconds = 10
        runner_metadata_options = {
          instance_metadata_tags      = "disabled"
          http_endpoint               = "enabled"
          http_tokens                 = "optional"
          http_put_response_hop_limit = 1
        }
        pool_config       = local.pool_config
        pool_runner_owner = "migration-test"
        job_retry = {
          enable             = true
          delay_in_seconds   = 60
          delay_backoff      = 2
          max_attempts       = 2
          lambda_memory_size = 256
          lambda_timeout     = 30
        }
      }
    }
  }
}

resource "random_id" "webhook_secret" {
  byte_length = 20
}

module "base" {
  source = "../base"

  prefix     = local.environment
  aws_region = var.aws_region
}

module "runners" {
  source = "../../modules/multi-runner"

  prefix     = local.environment
  aws_region = var.aws_region

  vpc_id     = module.base.vpc.vpc_id
  subnet_ids = module.base.vpc.private_subnets

  experimental_features = []
  multi_runner_config   = local.multi_runner_config

  tags = {
    Example = "migration-test"
    Feature = "state-migration"
  }

  github_app = {
    id             = var.github_app.id
    key_base64     = var.github_app.key_base64
    webhook_secret = random_id.webhook_secret.hex
  }

  additional_github_apps = [{
    id              = "1"
    key_base64      = "ministack-invalid-additional-key"
    installation_id = "2"
  }]

  enable_ami_housekeeper                     = true
  ami_housekeeper_lambda_memory_size         = 300
  ami_housekeeper_lambda_timeout             = 120
  ami_housekeeper_lambda_schedule_expression = "rate(1 day)"
  ami_housekeeper_cleanup_config = {
    minimumDaysOld = 1
    dryRun         = true
    amiFilters = [{
      Name   = "name"
      Values = ["migration-test-*"]
    }]
  }

  enable_managed_runner_security_group                           = true
  runners_scale_up_lambda_timeout                                = 45
  runners_scale_down_lambda_timeout                              = 70
  scale_up_lambda_memory_size                                    = 768
  scale_down_lambda_memory_size                                  = 640
  webhook_lambda_memory_size                                     = 384
  webhook_lambda_timeout                                         = 20
  pool_lambda_timeout                                            = 90
  pool_lambda_reserved_concurrent_executions                     = 2
  lambda_event_source_mapping_batch_size                         = 25
  lambda_event_source_mapping_maximum_batching_window_in_seconds = 10
  lambda_architecture                                            = "arm64"

  eventbridge = {
    enable        = true
    accept_events = ["workflow_job"]
  }

  runners_ssm_housekeeper = {
    schedule_expression = "rate(12 hours)"
    enabled             = true
    lambda_memory_size  = 640
    lambda_timeout      = 75
    config = {
      tokenPath      = "/migration-test/tokens"
      minimumDaysOld = 3
      dryRun         = true
    }
  }

  metrics = {
    enable    = true
    namespace = "MigrationTest"
    metric = {
      enable_github_app_rate_limit    = true
      enable_job_retry                = true
      enable_spot_termination_warning = true
    }
  }

  tracing_config = {
    mode                  = "Active"
    capture_http_requests = true
    capture_error         = true
  }

  log_level                 = "debug"
  logging_retention_in_days = 30
  log_class                 = "STANDARD"

  instance_termination_watcher = {
    enable = true
    features = {
      enable_runner_deregistration                 = true
      enable_spot_termination_handler              = true
      enable_spot_termination_notification_watcher = true
    }
  }

  runner_binaries_syncer_memory_size    = 256
  runner_binaries_syncer_lambda_timeout = 300
  state_event_rule_binaries_syncer      = "ENABLED"
}

module "webhook_github_app" {
  source     = "../../modules/webhook-github-app"
  depends_on = [module.runners]

  github_app = {
    id             = var.github_app.id
    key_base64     = var.github_app.key_base64
    webhook_secret = random_id.webhook_secret.hex
  }
  webhook_endpoint = module.runners.webhook.endpoint
}
