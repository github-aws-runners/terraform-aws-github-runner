mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }
}
mock_provider "random" {}
mock_provider "null" {}

variables {
  aws_region = "eu-west-1"
  vpc_id     = "vpc-12345678"
  subnet_ids = ["subnet-12345678"]

  github_app = {
    id             = "123456"
    key_base64     = "dGVzdA=="
    webhook_secret = "test-secret"
  }

  lambda_s3_bucket      = "lambda-artifacts"
  webhook_lambda_s3_key = "webhook.zip"
  runners_lambda_zip    = "README.md"
  runners_lambda_s3_key = "runners.zip"
  syncer_lambda_s3_key  = "runner-binaries-syncer.zip"
}

run "empty_runner_configurations_return_empty_output_maps" {
  command = plan

  assert {
    condition     = length(output.runners_map) == 0 && length(output.runners_map_v2) == 0
    error_message = "Stable and experimental runner outputs must both be empty when no runner configurations are supplied."
  }

  assert {
    condition = (
      length(local.raw_translated_experimental.multi_runner_config) == 0
      && length(local.translated_experimental.multi_runner_config) == 0
      && length(local.webhook_runner_config) == 0
      && length(local.runner_matcher_config) == 0
      && length(module.runner_configs) == 0
    )
    error_message = "An empty stable and experimental configuration must translate to an empty raw runner-configuration map without selecting a v2 runner configuration."
  }

  assert {
    condition = (
      local.github_app_parameters.webhook_secret != null
      && module.ssm.parameters.github_app_webhook_secret != null
      && output.ssm_parameters.webhook_secret != null
      && output.webhook != null
    )
    error_message = "Stable v1 must retain its shared webhook and webhook-secret parameter even when multi_runner_config is empty."
  }
}

run "stable_v1_keeps_legacy_runner_module" {
  command = plan

  variables {
    tags = {
      StableGlobal = "global"
      Precedence   = "global"
    }

    repository_white_list    = ["legacy-owner/legacy-repository"]
    queue_selection_strategy = "random"
    eventbridge = {
      enable        = false
      accept_events = ["workflow_job"]
    }
    matcher_config_parameter_store_tier = "Advanced"
    webhook_lambda_apigateway_access_log_settings = {
      destination_arn = "arn:aws:logs:eu-west-1:123456789012:log-group:legacy-api-access"
      format          = "$context.requestId"
    }
    webhook_lambda_s3_object_version = "legacy-webhook-version"

    lambda_runtime            = "nodejs20.x"
    lambda_architecture       = "x86_64"
    lambda_subnet_ids         = ["subnet-legacy-lambda"]
    lambda_security_group_ids = ["sg-legacy-lambda"]
    lambda_principals = [{
      type        = "AWS"
      identifiers = ["arn:aws:iam::123456789012:role/legacy-lambda-principal"]
    }]
    webhook_lambda_memory_size            = 320
    webhook_lambda_timeout                = 25
    runners_scale_up_lambda_timeout       = 47
    runners_lambda_s3_object_version      = "legacy-runners-version"
    runner_binaries_syncer_memory_size    = 640
    runner_binaries_syncer_lambda_timeout = 70
    role_path                             = "/legacy/"
    role_permissions_boundary             = "arn:aws:iam::123456789012:policy/legacy-boundary"
    ghes_url                              = "https://legacy.example.com"
    ghes_ssl_verify                       = false
    user_agent                            = "legacy-user-agent"
    log_level                             = "warn"
    logging_retention_in_days             = 14
    logging_kms_key_id                    = "arn:aws:kms:eu-west-1:123456789012:key/legacy-logs"
    log_class                             = "STANDARD"
    kms_key_arn                           = "arn:aws:kms:eu-west-1:123456789012:key/legacy-ssm"

    queue_encryption = {
      kms_data_key_reuse_period_seconds = 300
      kms_master_key_id                 = "arn:aws:kms:eu-west-1:123456789012:key/legacy-queue"
      sqs_managed_sse_enabled           = null
    }

    lambda_tags = {
      LegacyLambda = "legacy"
    }

    tracing_config = {
      mode                  = "Active"
      capture_http_requests = true
      capture_error         = false
    }

    metrics = {
      enable    = true
      namespace = "LegacyMetrics"
      metric = {
        enable_github_app_rate_limit    = true
        enable_job_retry                = false
        enable_spot_termination_warning = false
      }
    }

    ssm_paths = {
      root    = "legacy-root"
      app     = "legacy-app"
      runners = "legacy-runners"
      webhook = "legacy-webhook"
    }

    parameter_store_tags = {
      LegacyParameter = "legacy"
      Precedence      = "legacy-parameter"
    }

    runners_ssm_housekeeper = {
      schedule_expression = "rate(12 hours)"
      enabled             = false
      lambda_memory_size  = 320
      lambda_timeout      = 45
      config = {
        tokenPath      = "/legacy/cleanup/tokens"
        minimumDaysOld = 5
        dryRun         = true
      }
    }

    instance_termination_watcher = {
      enable                       = true
      enable_runner_deregistration = true
      environment_variables = {
        LEGACY_WATCHER = "true"
      }
      features = {
        enable_spot_termination_handler              = true
        enable_spot_termination_notification_watcher = true
      }
      memory_size       = 448
      timeout           = 35
      s3_key            = "termination-watcher.zip"
      s3_object_version = "legacy-watcher-version"
    }

    enable_ami_housekeeper                     = true
    ami_housekeeper_lambda_memory_size         = 384
    ami_housekeeper_lambda_timeout             = 90
    ami_housekeeper_lambda_s3_key              = "ami-housekeeper.zip"
    ami_housekeeper_lambda_s3_object_version   = "legacy-ami-housekeeper-version"
    ami_housekeeper_lambda_schedule_expression = "rate(2 days)"
    ami_housekeeper_cleanup_config = {
      maxItems       = 7
      minimumDaysOld = 14
      dryRun         = true
    }

    experimental = {
      tags = {
        ExperimentalOnly = "ignored"
      }
      roles = {
        path = "/experimental/"
      }
      lambda = {
        artifact = {
          s3 = {
            bucket = "experimental-ignored-artifacts"
          }
        }
        runtime      = "nodejs22.x"
        architecture = "sparc64"
        principals = [{
          type        = "AWS"
          identifiers = ["arn:aws:iam::123456789012:role/experimental-ignored-principal"]
        }]
        subnet_ids         = ["subnet-experimental-lambda"]
        security_group_ids = ["sg-experimental-lambda"]
        tags = {
          ExperimentalLambda = "ignored"
        }
      }

      orchestration_provider = {
        webhook = {
          lambda = {
            webhook = {
              memory_size = 896
              timeout     = 90
            }
          }
        }
      }
      github = {
        app = {
          id = "incomplete-experimental-id"
        }
        additional_apps = [{ id = "incomplete-additional-app-id" }]
        enterprise_server = {
          url        = "https://experimental.example.com"
          ssl_verify = true
        }
        user_agent = "experimental-user-agent"
      }
      ssm = {
        paths = {
          root   = "relative-experimental-root"
          tokens = "experimental-tokens"
          config = "experimental-config"
        }
        kms_key_id = "arn:aws:kms:eu-west-1:123456789012:key/experimental-ssm"
        tags = {
          ExperimentalSsm = "ignored"
        }
        parameters = {
          tags = {
            ExperimentalParameter = "ignored"
          }
        }
        housekeeper = {
          schedule_expression = "rate(1 hour)"
          state               = "PAUSED"
          lambda = {
            memory_size = 896
            timeout     = 90
          }
          config = {
            tokenPath      = "/experimental/cleanup/tokens"
            minimumDaysOld = 1
            dryRun         = false
          }
        }
      }
      observability = {
        logs = {
          level             = "verbose"
          retention_in_days = 30
          kms_key_id        = "arn:aws:kms:eu-west-1:123456789012:key/experimental-logs"
          class             = "ARCHIVE"
        }
        tracing = {
          mode                  = "PassThrough"
          capture_http_requests = false
          capture_error         = true
        }
        metrics = {
          enable    = false
          namespace = "ExperimentalMetrics"
          metric = {
            enable_github_app_rate_limit    = false
            enable_job_retry                = true
            enable_spot_termination_warning = true
          }
        }
      }
    }

    multi_runner_config = {
      linux = {
        runner_config = {
          runner_os                      = "linux"
          runner_architecture            = "x64"
          instance_types                 = ["m5.large"]
          runners_maximum_count          = 2
          enable_runner_binaries_syncer  = true
          enable_organization_runners    = true
          delay_webhook_event            = 17
          job_queue_retention_in_seconds = 12345
        }
        matcherConfig = {
          labelMatchers = [["self-hosted", "linux", "x64"]]
        }
        redrive_build_queue = {
          enabled         = true
          maxReceiveCount = 3
        }
      }
    }
  }

  assert {
    condition = (
      toset(keys(local.raw_translated_experimental)) == toset([
        "tags",
        "roles",
        "runner",
        "github",
        "lambda",
        "orchestration_provider",
        "storage_provider",
        "ssm",
        "observability",
        "compute_provider",
        "multi_runner_config",
      ])
      && toset(keys(local.raw_translated_experimental.github)) == toset([
        "app",
        "additional_apps",
        "enterprise_server",
        "user_agent",
      ])
      && toset(keys(local.raw_translated_experimental.lambda)) == toset([
        "artifact",
        "runtime",
        "architecture",
        "principals",
        "subnet_ids",
        "security_group_ids",
        "tags",
        "role",
      ])
      && toset(keys(local.raw_translated_experimental.orchestration_provider)) == toset([
        "webhook",
      ])
      && toset(keys(local.raw_translated_experimental.orchestration_provider.webhook)) == toset([
        "queue_selection_strategy",
        "eventbridge",
        "matcher_config_parameter_store_tier",
        "runner",
        "github",
        "lambda",
        "queue",
      ])
      && toset(keys(local.raw_translated_experimental.orchestration_provider.webhook.runner)) == toset([
        "boot_time_in_minutes",
        "ephemeral",
        "jit_config_enabled",
        "maximum_count",
      ])
      && toset(keys(local.raw_translated_experimental.orchestration_provider.webhook.github)) == toset([
        "repository_white_list",
      ])
      && toset(keys(local.raw_translated_experimental.orchestration_provider.webhook.lambda)) == toset([
        "artifact",
        "scale",
        "webhook",
        "pool",
      ])
      && toset(keys(local.raw_translated_experimental.orchestration_provider.webhook.lambda.scale)) == toset([
        "up",
        "down",
      ])
      && toset(keys(local.raw_translated_experimental.multi_runner_config["linux"])) == toset([
        "tags",
        "runner",
        "lambda",
        "orchestration_provider",
        "ssm",
        "observability",
        "compute_provider",
      ])
      && toset(keys(local.raw_translated_experimental.multi_runner_config["linux"].lambda)) == toset([
        "runtime",
        "architecture",
        "subnet_ids",
        "security_group_ids",
        "tags",
        "role",
      ])
      && toset(keys(local.raw_translated_experimental.multi_runner_config["linux"].orchestration_provider)) == toset([
        "webhook",
      ])
      && toset(keys(local.raw_translated_experimental.multi_runner_config["linux"].orchestration_provider.webhook)) == toset([
        "runner",
        "github",
        "lambda",
        "queue",
        "job_retry",
        "matcherConfig",
      ])
      && toset(keys(local.raw_translated_experimental.multi_runner_config["linux"].orchestration_provider.webhook.lambda)) == toset([
        "scale",
        "pool",
      ])
      && toset(keys(local.raw_translated_experimental.multi_runner_config["linux"].orchestration_provider.webhook.lambda.scale)) == toset([
        "up",
        "down",
      ])
      && toset(keys(local.raw_translated_experimental.multi_runner_config["linux"].orchestration_provider.webhook.queue)) == toset([
        "delay_webhook_event",
        "job_queue_retention_in_seconds",
        "visibility_timeout_seconds",
        "redrive_build_queue",
        "tags",
      ])
      && toset(keys(local.raw_translated_experimental.orchestration_provider.webhook.queue)) == toset([
        "delay_webhook_event",
        "job_queue_retention_in_seconds",
        "visibility_timeout_seconds",
        "redrive_build_queue",
        "tags",
        "encryption",
      ])
      && toset(keys(local.raw_translated_experimental.multi_runner_config["linux"].compute_provider)) == toset(["aws"])
      && toset(keys(local.raw_translated_experimental.multi_runner_config["linux"].compute_provider.aws)) == toset(["ec2"])
      && toset(keys(local.raw_translated_experimental.multi_runner_config["linux"].compute_provider.aws.ec2.binaries_syncer)) == toset(["enabled"])
      && local.raw_translated_experimental.storage_provider.aws.dynamodb == null
      && local.raw_translated_experimental.storage_provider.aws.ssm != null
      && local.storage_provider_type == "aws_ssm"
      && length(module.storage_aws_dynamodb) == 0
      && !contains(keys(local.raw_translated_experimental.multi_runner_config["linux"].ssm), "kms_key_id")
      && !contains(keys(local.raw_translated_experimental.runner), "boot_time_in_minutes")
      && !contains(keys(local.raw_translated_experimental.runner), "ephemeral")
      && !contains(keys(local.raw_translated_experimental.runner), "jit_config_enabled")
      && !contains(keys(local.raw_translated_experimental.runner), "maximum_count")
      && !contains(keys(local.raw_translated_experimental.multi_runner_config["linux"].runner), "boot_time_in_minutes")
      && !contains(keys(local.raw_translated_experimental.multi_runner_config["linux"].runner), "ephemeral")
      && !contains(keys(local.raw_translated_experimental.multi_runner_config["linux"].runner), "jit_config_enabled")
      && !contains(keys(local.raw_translated_experimental.multi_runner_config["linux"].runner), "maximum_count")
      && local.raw_translated_experimental.orchestration_provider.webhook.runner.boot_time_in_minutes == 5
      && !contains(keys(local.raw_translated_experimental.multi_runner_config["linux"]), "scale_up")
    )
    error_message = "Stable v1 must translate into the exact raw experimental schema before defaults, queue event-source mappings, binary artifacts, or runner-config component shapes are resolved."
  }

  assert {
    condition = (
      toset(keys(local.translated_experimental_base.multi_runner_config["linux"].compute_provider.aws.ec2.binaries_syncer)) == toset(["enabled"])
      && toset(keys(local.translated_experimental.multi_runner_config["linux"].compute_provider.aws.ec2.binaries_syncer)) == toset(["enabled", "s3"])
      && local.translated_experimental.multi_runner_config["linux"].compute_provider.aws.ec2.binaries_syncer.enabled
      && local.translated_experimental.multi_runner_config["linux"].compute_provider.aws.ec2.binaries_syncer.s3 != null
      && toset(keys(local.translated_experimental.multi_runner_config["linux"].compute_provider.aws.ec2.binaries_syncer.s3)) == toset(["arn", "id", "key"])
    )
    error_message = "Stable translation must discover binary-syncer runner configurations from the base object, then enrich the final canonical configuration with its resolved S3 distribution."
  }

  assert {
    condition = (
      local.raw_translated_experimental.tags == var.tags
      && local.raw_translated_experimental.roles.path == var.role_path
      && local.raw_translated_experimental.roles.permissions_boundary == var.role_permissions_boundary
      && local.raw_translated_experimental.github.app == var.github_app
      && local.raw_translated_experimental.github.additional_apps == var.additional_github_apps
      && local.raw_translated_experimental.orchestration_provider.webhook.github.repository_white_list == var.repository_white_list
      && local.raw_translated_experimental.github.enterprise_server.url == var.ghes_url
      && local.raw_translated_experimental.github.enterprise_server.ssl_verify == var.ghes_ssl_verify
      && local.raw_translated_experimental.github.user_agent == var.user_agent
      && local.raw_translated_experimental.orchestration_provider.webhook.queue_selection_strategy == var.queue_selection_strategy
      && local.raw_translated_experimental.orchestration_provider.webhook.eventbridge == var.eventbridge
      && local.raw_translated_experimental.orchestration_provider.webhook.matcher_config_parameter_store_tier == var.matcher_config_parameter_store_tier
      && local.raw_translated_experimental.orchestration_provider.webhook.lambda.artifact.zip == null
      && local.raw_translated_experimental.lambda.artifact.s3.bucket == var.lambda_s3_bucket
      && local.raw_translated_experimental.orchestration_provider.webhook.lambda.artifact.s3.key == var.runners_lambda_s3_key
      && local.raw_translated_experimental.orchestration_provider.webhook.lambda.artifact.s3.object_version == var.runners_lambda_s3_object_version
      && local.raw_translated_experimental.lambda.runtime == var.lambda_runtime
      && local.raw_translated_experimental.lambda.architecture == var.lambda_architecture
      && local.raw_translated_experimental.lambda.principals == var.lambda_principals
      && local.raw_translated_experimental.lambda.subnet_ids == var.lambda_subnet_ids
      && local.raw_translated_experimental.lambda.security_group_ids == var.lambda_security_group_ids
      && local.raw_translated_experimental.lambda.tags == var.lambda_tags
      && local.raw_translated_experimental.orchestration_provider.webhook.lambda.scale.up.event_source_mapping.batch_size == var.lambda_event_source_mapping_batch_size
      && local.raw_translated_experimental.orchestration_provider.webhook.lambda.scale.up.event_source_mapping.maximum_batching_window_in_seconds == var.lambda_event_source_mapping_maximum_batching_window_in_seconds
      && local.raw_translated_experimental.orchestration_provider.webhook.lambda.webhook.artifact.zip == null
      && local.raw_translated_experimental.orchestration_provider.webhook.lambda.webhook.artifact.s3.key == var.webhook_lambda_s3_key
      && local.raw_translated_experimental.orchestration_provider.webhook.lambda.webhook.artifact.s3.object_version == var.webhook_lambda_s3_object_version
      && local.raw_translated_experimental.orchestration_provider.webhook.lambda.webhook.api_gateway_access_log_settings == var.webhook_lambda_apigateway_access_log_settings
      && local.raw_translated_experimental.orchestration_provider.webhook.lambda.webhook.memory_size == var.webhook_lambda_memory_size
      && local.raw_translated_experimental.orchestration_provider.webhook.lambda.webhook.timeout == var.webhook_lambda_timeout
      && local.raw_translated_experimental.orchestration_provider.webhook.queue.visibility_timeout_seconds == var.runners_scale_up_lambda_timeout
      && local.raw_translated_experimental.orchestration_provider.webhook.queue.encryption == var.queue_encryption
      && local.raw_translated_experimental.ssm.paths.root == "/legacy-root/github-actions"
      && local.raw_translated_experimental.ssm.paths.app == var.ssm_paths.app
      && local.raw_translated_experimental.ssm.paths.webhook == var.ssm_paths.webhook
      && local.raw_translated_experimental.ssm.paths.tokens == "${var.ssm_paths.runners}/tokens"
      && local.raw_translated_experimental.ssm.paths.config == "${var.ssm_paths.runners}/config"
      && local.raw_translated_experimental.ssm.kms_key_id == var.kms_key_arn
      && local.raw_translated_experimental.ssm.parameters.tags == var.parameter_store_tags
      && local.raw_translated_experimental.observability.logs.level == var.log_level
      && local.raw_translated_experimental.observability.logs.retention_in_days == var.logging_retention_in_days
      && local.raw_translated_experimental.observability.logs.kms_key_id == var.logging_kms_key_id
      && local.raw_translated_experimental.observability.logs.class == var.log_class
      && local.raw_translated_experimental.observability.tracing == var.tracing_config
      && local.raw_translated_experimental.observability.metrics.enable == var.metrics.enable
      && local.raw_translated_experimental.observability.metrics.namespace == var.metrics.namespace
      && local.raw_translated_experimental.observability.metrics.metric.enable_github_app_rate_limit == var.metrics.metric.enable_github_app_rate_limit
      && local.raw_translated_experimental.observability.metrics.metric.enable_job_retry == var.metrics.metric.enable_job_retry
      && local.raw_translated_experimental.observability.metrics.metric.enable_spot_termination
      && local.raw_translated_experimental.observability.metrics.metric.enable_spot_termination_warning == var.metrics.metric.enable_spot_termination_warning
      && local.raw_translated_experimental.ssm.housekeeper.lambda.artifact.zip == null
      && local.raw_translated_experimental.ssm.housekeeper.lambda.artifact.s3.key == var.runners_lambda_s3_key
      && local.raw_translated_experimental.ssm.housekeeper.lambda.artifact.s3.object_version == var.runners_lambda_s3_object_version
      && local.translated_experimental.multi_runner_config["linux"].ssm.housekeeper.lambda.artifact.s3.key == var.runners_lambda_s3_key
      && local.translated_experimental.multi_runner_config["linux"].ssm.housekeeper.lambda.artifact.s3.object_version == var.runners_lambda_s3_object_version
      && local.raw_translated_experimental.compute_provider.aws.ec2.vpc_id == var.vpc_id
      && local.raw_translated_experimental.compute_provider.aws.ec2.subnet_ids == var.subnet_ids
      && local.raw_translated_experimental.compute_provider.aws.ec2.ami.housekeeper.enabled == var.enable_ami_housekeeper
      && local.raw_translated_experimental.compute_provider.aws.ec2.ami.housekeeper.cleanup_config == var.ami_housekeeper_cleanup_config
      && local.raw_translated_experimental.compute_provider.aws.ec2.ami.housekeeper.artifact.zip == null
      && local.raw_translated_experimental.compute_provider.aws.ec2.ami.housekeeper.artifact.s3.key == var.ami_housekeeper_lambda_s3_key
      && local.raw_translated_experimental.compute_provider.aws.ec2.ami.housekeeper.artifact.s3.object_version == var.ami_housekeeper_lambda_s3_object_version
      && local.raw_translated_experimental.compute_provider.aws.ec2.ami.housekeeper.lambda.memory_size == var.ami_housekeeper_lambda_memory_size
      && local.raw_translated_experimental.compute_provider.aws.ec2.ami.housekeeper.lambda.timeout == var.ami_housekeeper_lambda_timeout
      && local.raw_translated_experimental.compute_provider.aws.ec2.ami.housekeeper.schedule.expression == var.ami_housekeeper_lambda_schedule_expression
      && local.raw_translated_experimental.compute_provider.aws.ec2.instance_termination_watcher.enabled == var.instance_termination_watcher.enable
      && local.raw_translated_experimental.compute_provider.aws.ec2.instance_termination_watcher.features == var.instance_termination_watcher.features
      && local.raw_translated_experimental.compute_provider.aws.ec2.instance_termination_watcher.enable_runner_deregistration == var.instance_termination_watcher.enable_runner_deregistration
      && local.raw_translated_experimental.compute_provider.aws.ec2.instance_termination_watcher.environment_variables == var.instance_termination_watcher.environment_variables
      && local.raw_translated_experimental.compute_provider.aws.ec2.instance_termination_watcher.artifact.zip == null
      && local.raw_translated_experimental.compute_provider.aws.ec2.instance_termination_watcher.artifact.s3.key == var.instance_termination_watcher.s3_key
      && local.raw_translated_experimental.compute_provider.aws.ec2.instance_termination_watcher.artifact.s3.object_version == var.instance_termination_watcher.s3_object_version
      && local.raw_translated_experimental.compute_provider.aws.ec2.instance_termination_watcher.lambda.memory_size == var.instance_termination_watcher.memory_size
      && local.raw_translated_experimental.compute_provider.aws.ec2.instance_termination_watcher.lambda.timeout == var.instance_termination_watcher.timeout
      && local.raw_translated_experimental.compute_provider.aws.ec2.runner_binaries.enabled
      && local.raw_translated_experimental.compute_provider.aws.ec2.runner_binaries.s3.encryption.enabled
      && local.raw_translated_experimental.compute_provider.aws.ec2.runner_binaries.s3.encryption.sse_algorithm == var.runner_binaries_s3_sse_configuration.rule.apply_server_side_encryption_by_default.sse_algorithm
      && local.raw_translated_experimental.compute_provider.aws.ec2.runner_binaries.s3.tags == var.runner_binaries_s3_tags
      && local.raw_translated_experimental.compute_provider.aws.ec2.runner_binaries.s3.versioning == var.runner_binaries_s3_versioning
      && local.raw_translated_experimental.compute_provider.aws.ec2.runner_binaries.syncer.artifact.s3.key == var.syncer_lambda_s3_key
      && local.raw_translated_experimental.compute_provider.aws.ec2.runner_binaries.syncer.artifact.s3.object_version == var.syncer_lambda_s3_object_version
      && local.raw_translated_experimental.compute_provider.aws.ec2.runner_binaries.syncer.lambda.memory_size == var.runner_binaries_syncer_memory_size
      && local.raw_translated_experimental.compute_provider.aws.ec2.runner_binaries.syncer.lambda.timeout == var.runner_binaries_syncer_lambda_timeout
      && local.raw_translated_experimental.compute_provider.aws.ec2.runner_binaries.syncer.schedule.state == var.state_event_rule_binaries_syncer
      && local.raw_translated_experimental.multi_runner_config["linux"].runner.os == var.multi_runner_config["linux"].runner_config.runner_os
      && local.raw_translated_experimental.multi_runner_config["linux"].runner.architecture == var.multi_runner_config["linux"].runner_config.runner_architecture
      && !contains(keys(local.raw_translated_experimental.multi_runner_config["linux"].runner), "boot_time_in_minutes")
      && !contains(keys(local.raw_translated_experimental.multi_runner_config["linux"].runner), "ephemeral")
      && !contains(keys(local.raw_translated_experimental.multi_runner_config["linux"].runner), "jit_config_enabled")
      && local.raw_translated_experimental.multi_runner_config["linux"].orchestration_provider.webhook.runner.boot_time_in_minutes == var.multi_runner_config["linux"].runner_config.runner_boot_time_in_minutes
      && local.raw_translated_experimental.multi_runner_config["linux"].orchestration_provider.webhook.runner.ephemeral == var.multi_runner_config["linux"].runner_config.enable_ephemeral_runners
      && local.raw_translated_experimental.multi_runner_config["linux"].orchestration_provider.webhook.runner.jit_config_enabled == var.multi_runner_config["linux"].runner_config.enable_jit_config
      && local.raw_translated_experimental.multi_runner_config["linux"].orchestration_provider.webhook.runner.maximum_count == var.multi_runner_config["linux"].runner_config.runners_maximum_count
      && local.raw_translated_experimental.multi_runner_config["linux"].orchestration_provider.webhook.github.organization_runners == var.multi_runner_config["linux"].runner_config.enable_organization_runners
      && local.raw_translated_experimental.multi_runner_config["linux"].orchestration_provider.webhook.lambda.scale.up.event_source_mapping.batch_size == var.multi_runner_config["linux"].runner_config.lambda_event_source_mapping_batch_size
      && local.raw_translated_experimental.multi_runner_config["linux"].orchestration_provider.webhook.queue.delay_webhook_event == var.multi_runner_config["linux"].runner_config.delay_webhook_event
      && local.raw_translated_experimental.multi_runner_config["linux"].orchestration_provider.webhook.queue.job_queue_retention_in_seconds == var.multi_runner_config["linux"].runner_config.job_queue_retention_in_seconds
      && local.raw_translated_experimental.multi_runner_config["linux"].orchestration_provider.webhook.queue.visibility_timeout_seconds == var.runners_scale_up_lambda_timeout
      && local.raw_translated_experimental.multi_runner_config["linux"].orchestration_provider.webhook.queue.redrive_build_queue == var.multi_runner_config["linux"].redrive_build_queue
      && local.raw_translated_experimental.multi_runner_config["linux"].compute_provider.aws.ec2.binaries_syncer.enabled
      && local.raw_translated_experimental.multi_runner_config["linux"].orchestration_provider.webhook.matcherConfig == var.multi_runner_config["linux"].matcherConfig
    )
    error_message = "Stable v1 flat and per-runner inputs must populate every raw translation family while conflicting experimental globals remain inactive."
  }

  assert {
    condition = (
      !var.runners_ssm_housekeeper.enabled
      && local.translated_experimental.ssm.housekeeper.state == "DISABLED"
      && keys(module.runners) == ["linux"]
    )
    error_message = "Stable v1 must translate runners_ssm_housekeeper.enabled=false to the DISABLED child event-rule state while retaining module.runners ownership."
  }

  assert {
    condition     = keys(local.runner_config_by_provider.aws_ec2) == ["linux"]
    error_message = "Stable multi_runner_config entries must route to the EC2 provider."
  }

  assert {
    condition = (
      !local.use_multi_runner_config_v2
      && toset(keys(local.raw_translated_experimental.multi_runner_config)) == toset(["linux"])
      && toset(keys(local.translated_experimental.multi_runner_config)) == toset(["linux"])
      && length(module.runner_configs) == 0
      && keys(module.runners) == ["linux"]
    )
    error_message = "Stable multi_runner_config entries must keep the original runner configuration and remain isolated from v2."
  }

  assert {
    condition = (
      var.experimental.github.app.key_base64 == null
      && var.experimental.github.app.webhook_secret == null
      && var.experimental.github.additional_apps[0].key_base64 == null
      && var.experimental.lambda.architecture == "sparc64"
      && var.experimental.observability.logs.level == "verbose"
      && var.experimental.observability.logs.class == "ARCHIVE"
      && var.experimental.ssm.paths.root == "relative-experimental-root"
      && var.experimental.ssm.housekeeper.state == "PAUSED"
      && !local.use_multi_runner_config_v2
      && keys(module.runners) == ["linux"]
    )
    error_message = "Invalid but unused experimental sibling globals must remain gated when a stable v1 configuration owns the deployment."
  }

  assert {
    condition = (
      contains(keys(local.translated_experimental.multi_runner_config["linux"]), "compute_provider")
      && !contains(keys(local.translated_experimental.multi_runner_config["linux"]), "runner_config")
      && local.translated_experimental.multi_runner_config["linux"].orchestration_provider.webhook.github.organization_runners
    )
    error_message = "Stable module inputs must use the canonical translated runner configuration while retaining stable module.runners ownership."
  }

  assert {
    condition     = keys(module.runners) == ["linux"] && length(module.runner_configs) == 0
    error_message = "Stable multi_runner_config entries must retain the historical module.runners address."
  }

  assert {
    condition     = keys(aws_sqs_queue.queued_builds) == ["linux"]
    error_message = "Common queue ownership must preserve the stable runner configuration key."
  }

  assert {
    condition = (
      aws_sqs_queue.queued_builds["linux"].tags == var.tags
      && aws_sqs_queue.queued_builds_dlq["linux"].tags == var.tags
    )
    error_message = "Stable multi_runner_config queues must continue to receive exactly the module-level tags."
  }

  assert {
    condition = (
      aws_sqs_queue.queued_builds["linux"].delay_seconds == 17
      && aws_sqs_queue.queued_builds["linux"].message_retention_seconds == 12345
      && aws_sqs_queue.queued_builds["linux"].visibility_timeout_seconds == var.runners_scale_up_lambda_timeout
      && aws_sqs_queue.queued_builds["linux"].kms_master_key_id == var.queue_encryption.kms_master_key_id
      && aws_sqs_queue.queued_builds["linux"].kms_data_key_reuse_period_seconds == var.queue_encryption.kms_data_key_reuse_period_seconds
      && aws_sqs_queue.queued_builds_dlq["linux"].kms_master_key_id == var.queue_encryption.kms_master_key_id
      && aws_sqs_queue.queued_builds_dlq["linux"].kms_data_key_reuse_period_seconds == var.queue_encryption.kms_data_key_reuse_period_seconds
    )
    error_message = "Stable v1 queues must retain per-runner delay and retention plus flat timeout and encryption inputs after translation."
  }

  assert {
    condition = (
      output.runners_map["linux"].lambda_up.runtime == "nodejs20.x"
      && output.runners_map["linux"].lambda_up.s3_bucket == var.lambda_s3_bucket
      && output.runners_map["linux"].lambda_up.s3_key == var.runners_lambda_s3_key
      && output.runners_map["linux"].lambda_up.s3_object_version == "legacy-runners-version"
      && output.runners_map["linux"].role_scale_up.path == "/legacy/"
      && output.webhook.lambda.runtime == "nodejs20.x"
      && output.webhook.lambda.architectures == tolist(["x86_64"])
      && output.webhook.lambda.memory_size == 320
      && output.webhook.lambda.timeout == 25
      && output.webhook.lambda.s3_bucket == "lambda-artifacts"
      && output.webhook.lambda.s3_key == "webhook.zip"
      && output.webhook.lambda.s3_object_version == "legacy-webhook-version"
      && toset(output.webhook.lambda.vpc_config[0].subnet_ids) == toset(["subnet-legacy-lambda"])
      && toset(output.webhook.lambda.vpc_config[0].security_group_ids) == toset(["sg-legacy-lambda"])
      && output.webhook.lambda.tags["LegacyLambda"] == "legacy"
      && !contains(keys(output.webhook.lambda.tags), "ExperimentalLambda")
      && output.webhook.lambda_role.path == "/legacy/"
      && output.webhook.lambda_role.permissions_boundary == "arn:aws:iam::123456789012:policy/legacy-boundary"
      && toset(jsondecode(output.webhook.lambda.environment[0].variables["REPOSITORY_ALLOW_LIST"])) == toset(var.repository_white_list)
      && output.webhook.lambda.environment[0].variables["QUEUE_SELECTION_STRATEGY"] == var.queue_selection_strategy
      && output.webhook.eventbridge == null
      && output.webhook.dispatcher == null
      && output.runners_map["linux"].lambda_up.environment[0].variables["GHES_URL"] == "https://legacy.example.com"
      && output.runners_map["linux"].lambda_up.environment[0].variables["NODE_TLS_REJECT_UNAUTHORIZED"] == "0"
      && output.runners_map["linux"].lambda_up.environment[0].variables["USER_AGENT"] == "legacy-user-agent"
    )
    error_message = "The stable v1 runner and shared webhook must use flat Lambda, artifact, network, tag, role, and GitHub inputs while ignoring experimental globals."
  }

  assert {
    condition = (
      keys(output.binaries_syncer_map) == ["linux_x64"]
      && output.binaries_syncer_map["linux_x64"].lambda.runtime == "nodejs20.x"
      && output.binaries_syncer_map["linux_x64"].lambda.architectures == tolist(["x86_64"])
      && output.binaries_syncer_map["linux_x64"].lambda.memory_size == 640
      && output.binaries_syncer_map["linux_x64"].lambda.timeout == 70
      && toset(output.binaries_syncer_map["linux_x64"].lambda.vpc_config[0].subnet_ids) == toset(["subnet-legacy-lambda"])
      && toset(output.binaries_syncer_map["linux_x64"].lambda.vpc_config[0].security_group_ids) == toset(["sg-legacy-lambda"])
      && output.binaries_syncer_map["linux_x64"].lambda.tags["LegacyLambda"] == "legacy"
      && !contains(keys(output.binaries_syncer_map["linux_x64"].lambda.tags), "ExperimentalLambda")
      && output.binaries_syncer_map["linux_x64"].lambda_role.path == "/legacy/"
      && output.binaries_syncer_map["linux_x64"].lambda_role.permissions_boundary == "arn:aws:iam::123456789012:policy/legacy-boundary"
      && output.binaries_syncer_map["linux_x64"].lambda.environment[0].variables["LOG_LEVEL"] == "WARN"
      && output.binaries_syncer_map["linux_x64"].lambda.tracing_config[0].mode == "Active"
      && output.binaries_syncer_map["linux_x64"].lambda_log_group.retention_in_days == 14
      && output.binaries_syncer_map["linux_x64"].lambda_log_group.kms_key_id == "arn:aws:kms:eu-west-1:123456789012:key/legacy-logs"
      && output.binaries_syncer_map["linux_x64"].lambda_log_group.log_group_class == "STANDARD"
    )
    error_message = "The stable v1 binary syncer must receive the same flat Lambda, network, role, and observability values through the translated configuration."
  }

  assert {
    condition = (
      output.instance_termination_watcher.lambda.function.runtime == "nodejs20.x"
      && output.instance_termination_watcher.lambda.function.architectures == tolist(["x86_64"])
      && output.instance_termination_watcher.lambda.function.memory_size == 448
      && output.instance_termination_watcher.lambda.function.timeout == 35
      && output.instance_termination_watcher.lambda.function.s3_bucket == "lambda-artifacts"
      && output.instance_termination_watcher.lambda.function.s3_key == "termination-watcher.zip"
      && output.instance_termination_watcher.lambda.function.s3_object_version == "legacy-watcher-version"
      && toset(output.instance_termination_watcher.lambda.function.vpc_config[0].subnet_ids) == toset(["subnet-legacy-lambda"])
      && toset(output.instance_termination_watcher.lambda.function.vpc_config[0].security_group_ids) == toset(["sg-legacy-lambda"])
      && output.instance_termination_watcher.lambda.function.tags["LegacyLambda"] == "legacy"
      && !contains(keys(output.instance_termination_watcher.lambda.function.tags), "ExperimentalLambda")
      && output.instance_termination_watcher.lambda_role.path == "/legacy/"
      && output.instance_termination_watcher.lambda_role.permissions_boundary == "arn:aws:iam::123456789012:policy/legacy-boundary"
      && output.instance_termination_watcher.lambda.function.environment[0].variables["GHES_URL"] == "https://legacy.example.com"
      && output.instance_termination_watcher.lambda.function.environment[0].variables["LOG_LEVEL"] == "warn"
      && output.instance_termination_watcher.lambda.function.tracing_config[0].mode == "Active"
      && output.instance_termination_watcher.lambda_log_group.retention_in_days == 14
      && output.instance_termination_watcher.lambda_log_group.kms_key_id == "arn:aws:kms:eu-west-1:123456789012:key/legacy-logs"
      && output.instance_termination_watcher.lambda_log_group.log_group_class == "STANDARD"
    )
    error_message = "The stable v1 termination watcher must receive flat component settings and translated global Lambda, role, GitHub, and observability values."
  }

  assert {
    condition = (
      length(module.ami_housekeeper) == 1
      && module.ami_housekeeper[0].lambda.runtime == "nodejs20.x"
      && module.ami_housekeeper[0].lambda.architectures == tolist(["x86_64"])
      && module.ami_housekeeper[0].lambda.memory_size == 384
      && module.ami_housekeeper[0].lambda.timeout == 90
      && module.ami_housekeeper[0].lambda.s3_bucket == "lambda-artifacts"
      && module.ami_housekeeper[0].lambda.s3_key == "ami-housekeeper.zip"
      && module.ami_housekeeper[0].lambda.s3_object_version == "legacy-ami-housekeeper-version"
      && module.ami_housekeeper[0].lambda.environment[0].variables["LOG_LEVEL"] == "WARN"
      && jsondecode(module.ami_housekeeper[0].lambda.environment[0].variables["AMI_CLEANUP_OPTIONS"]).maxItems == 7
      && jsondecode(module.ami_housekeeper[0].lambda.environment[0].variables["AMI_CLEANUP_OPTIONS"]).minimumDaysOld == 14
      && jsondecode(module.ami_housekeeper[0].lambda.environment[0].variables["AMI_CLEANUP_OPTIONS"]).dryRun
      && module.ami_housekeeper[0].lambda_role.path == "/legacy/"
      && module.ami_housekeeper[0].lambda_role.permissions_boundary == "arn:aws:iam::123456789012:policy/legacy-boundary"
    )
    error_message = "The stable v1 AMI housekeeper must preserve flat component settings through the translated compute-provider global while inheriting translated Lambda, role, and observability values."
  }

  assert {
    condition = (
      output.runners_map["linux"].lambda_up.environment[0].variables["LOG_LEVEL"] == "WARN"
      && output.runners_map["linux"].lambda_up.environment[0].variables["POWERTOOLS_METRICS_NAMESPACE"] == "LegacyMetrics"
      && output.runners_map["linux"].lambda_up.environment[0].variables["POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS"] == "true"
      && output.runners_map["linux"].lambda_up.environment[0].variables["POWERTOOLS_TRACER_CAPTURE_ERROR"] == "false"
      && output.runners_map["linux"].lambda_up_log_group.retention_in_days == 14
      && output.runners_map["linux"].lambda_up_log_group.kms_key_id == "arn:aws:kms:eu-west-1:123456789012:key/legacy-logs"
      && output.runners_map["linux"].lambda_up_log_group.log_group_class == "STANDARD"
      && output.runners_map["linux"].lambda_up.tracing_config[0].mode == "Active"
      && output.webhook.lambda.environment[0].variables["LOG_LEVEL"] == "WARN"
      && output.webhook.lambda.environment[0].variables["POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS"] == "true"
      && output.webhook.lambda.environment[0].variables["POWERTOOLS_TRACER_CAPTURE_ERROR"] == "false"
      && output.webhook.lambda.tracing_config[0].mode == "Active"
      && output.webhook.lambda_log_group.retention_in_days == 14
      && output.webhook.lambda_log_group.kms_key_id == "arn:aws:kms:eu-west-1:123456789012:key/legacy-logs"
      && output.webhook.lambda_log_group.log_group_class == "STANDARD"
    )
    error_message = "Experimental observability globals must not override stable v1 logging, tracing, or metrics inputs."
  }

  assert {
    condition = (
      local.translated_experimental.ssm.paths.root == "/legacy-root/github-actions"
      && local.translated_experimental.ssm.kms_key_id == "arn:aws:kms:eu-west-1:123456789012:key/legacy-ssm"
      && var.kms_key_arn == "arn:aws:kms:eu-west-1:123456789012:key/legacy-ssm"
      && output.ssm_parameters.id.name == "/legacy-root/github-actions/legacy-app/github_app_id"
      && output.webhook.lambda.environment[0].variables["PARAMETER_RUNNER_MATCHER_CONFIG_PATH"] == "/legacy-root/github-actions/legacy-webhook/runner-matcher-config"
      && output.runners_map["linux"].lambda_up.environment[0].variables["SSM_TOKEN_PATH"] == "/legacy-root/github-actions/linux/legacy-runners/tokens"
      && output.runners_map["linux"].lambda_up.environment[0].variables["SSM_CONFIG_PATH"] == "/legacy-root/github-actions/linux/legacy-runners/config"
      && tomap({
        for tag in jsondecode(output.runners_map["linux"].lambda_up.environment[0].variables["SSM_PARAMETER_STORE_TAGS"]) :
        tag.Key => tag.Value
        }) == tomap({
        StableGlobal      = "global"
        LegacyParameter   = "legacy"
        "ghr:environment" = "github-actions-linux"
        Precedence        = "legacy-parameter"
      })
    )
    error_message = "Experimental SSM globals must not affect stable v1 shared paths, runner paths, KMS selection, or parameter tags."
  }

  assert {
    condition     = keys(output.runners_map) == ["linux"]
    error_message = "Stable multi_runner_config must preserve the public runner map key."
  }

  assert {
    condition     = length(output.runners_map_v2) == 0
    error_message = "Stable multi_runner_config must not add entries to the experimental runners_map_v2 output."
  }

  assert {
    condition = toset(keys(output.runners_map["linux"])) == toset(
      [
        "launch_template_name",
        "launch_template_id",
        "launch_template_version",
        "launch_template_ami_id",
        "lambda_up",
        "lambda_up_log_group",
        "lambda_down",
        "lambda_down_log_group",
        "lambda_pool",
        "lambda_pool_log_group",
        "role_runner",
        "role_scale_up",
        "role_scale_down",
        "role_pool",
        "runners_log_groups",
        "logfiles",
      ]
    )
    error_message = "Stable multi_runner_config must retain its existing flat runners_map entry shape."
  }
}
