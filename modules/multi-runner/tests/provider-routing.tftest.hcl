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
      && length(module.runner_stacks) == 0
    )
    error_message = "An empty stable and experimental configuration must translate to an empty raw lane map without selecting a v2 runner stack."
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
        webhook = {
          memory_size = 896
          timeout     = 90
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
        "webhook",
        "lambda",
        "queue",
        "ssm",
        "observability",
        "compute_provider",
        "multi_runner_config",
      ])
      && toset(keys(local.raw_translated_experimental.github)) == toset([
        "app",
        "additional_apps",
        "repository_white_list",
        "enterprise_server",
        "user_agent",
      ])
      && toset(keys(local.raw_translated_experimental.multi_runner_config["linux"])) == toset([
        "tags",
        "runner",
        "github",
        "lambda",
        "queue",
        "job_retry",
        "ssm",
        "observability",
        "compute_provider",
        "matcherConfig",
      ])
      && toset(keys(local.raw_translated_experimental.multi_runner_config["linux"].lambda)) == toset([
        "runtime",
        "architecture",
        "subnet_ids",
        "security_group_ids",
        "tags",
        "role",
        "scale_up",
        "scale_down",
        "pool",
      ])
      && toset(keys(local.raw_translated_experimental.multi_runner_config["linux"].queue)) == toset([
        "delay_webhook_event",
        "job_queue_retention_in_seconds",
        "visibility_timeout_seconds",
        "redrive_build_queue",
        "tags",
      ])
      && toset(keys(local.raw_translated_experimental.queue)) == toset([
        "delay_webhook_event",
        "job_queue_retention_in_seconds",
        "visibility_timeout_seconds",
        "redrive_build_queue",
        "tags",
        "encryption",
      ])
      && toset(keys(local.raw_translated_experimental.multi_runner_config["linux"].compute_provider)) == toset(["ec2"])
      && toset(keys(local.raw_translated_experimental.multi_runner_config["linux"].compute_provider.ec2.binaries_syncer)) == toset(["enabled"])
      && !contains(keys(local.raw_translated_experimental.multi_runner_config["linux"].ssm), "kms_key_id")
      && !contains(keys(local.raw_translated_experimental.multi_runner_config["linux"]), "scale_up")
    )
    error_message = "Stable v1 must translate into the exact raw experimental schema before defaults, queue event-source mappings, binary artifacts, or runner-stack component shapes are resolved."
  }

  assert {
    condition = (
      toset(keys(local.translated_experimental_base.multi_runner_config["linux"].compute_provider.ec2.binaries_syncer)) == toset(["enabled"])
      && toset(keys(local.translated_experimental.multi_runner_config["linux"].compute_provider.ec2.binaries_syncer)) == toset(["enabled", "s3"])
      && local.translated_experimental.multi_runner_config["linux"].compute_provider.ec2.binaries_syncer.enabled
      && local.translated_experimental.multi_runner_config["linux"].compute_provider.ec2.binaries_syncer.s3 != null
      && toset(keys(local.translated_experimental.multi_runner_config["linux"].compute_provider.ec2.binaries_syncer.s3)) == toset(["arn", "id", "key"])
    )
    error_message = "Stable translation must discover binary-syncer lanes from the base object, then enrich the final canonical lane with its resolved S3 distribution."
  }

  assert {
    condition = (
      local.raw_translated_experimental.tags == var.tags
      && local.raw_translated_experimental.roles.path == var.role_path
      && local.raw_translated_experimental.roles.permissions_boundary == var.role_permissions_boundary
      && local.raw_translated_experimental.github.app == var.github_app
      && local.raw_translated_experimental.github.additional_apps == var.additional_github_apps
      && local.raw_translated_experimental.github.repository_white_list == var.repository_white_list
      && local.raw_translated_experimental.github.enterprise_server.url == var.ghes_url
      && local.raw_translated_experimental.github.enterprise_server.ssl_verify == var.ghes_ssl_verify
      && local.raw_translated_experimental.github.user_agent == var.user_agent
      && local.raw_translated_experimental.webhook.queue_selection_strategy == var.queue_selection_strategy
      && local.raw_translated_experimental.webhook.eventbridge == var.eventbridge
      && local.raw_translated_experimental.webhook.matcher_config_parameter_store_tier == var.matcher_config_parameter_store_tier
      && local.raw_translated_experimental.lambda.scale.artifact.zip == null
      && local.raw_translated_experimental.lambda.artifact.s3.bucket == var.lambda_s3_bucket
      && local.raw_translated_experimental.lambda.scale.artifact.s3.key == var.runners_lambda_s3_key
      && local.raw_translated_experimental.lambda.scale.artifact.s3.object_version == var.runners_lambda_s3_object_version
      && local.raw_translated_experimental.lambda.runtime == var.lambda_runtime
      && local.raw_translated_experimental.lambda.architecture == var.lambda_architecture
      && local.raw_translated_experimental.lambda.principals == var.lambda_principals
      && local.raw_translated_experimental.lambda.subnet_ids == var.lambda_subnet_ids
      && local.raw_translated_experimental.lambda.security_group_ids == var.lambda_security_group_ids
      && local.raw_translated_experimental.lambda.tags == var.lambda_tags
      && local.raw_translated_experimental.lambda.scale_up.event_source_mapping.batch_size == var.lambda_event_source_mapping_batch_size
      && local.raw_translated_experimental.lambda.scale_up.event_source_mapping.maximum_batching_window_in_seconds == var.lambda_event_source_mapping_maximum_batching_window_in_seconds
      && local.raw_translated_experimental.lambda.webhook.artifact.zip == null
      && local.raw_translated_experimental.lambda.webhook.artifact.s3.key == var.webhook_lambda_s3_key
      && local.raw_translated_experimental.lambda.webhook.artifact.s3.object_version == var.webhook_lambda_s3_object_version
      && local.raw_translated_experimental.lambda.webhook.api_gateway_access_log_settings == var.webhook_lambda_apigateway_access_log_settings
      && local.raw_translated_experimental.lambda.webhook.memory_size == var.webhook_lambda_memory_size
      && local.raw_translated_experimental.lambda.webhook.timeout == var.webhook_lambda_timeout
      && local.raw_translated_experimental.queue.visibility_timeout_seconds == var.runners_scale_up_lambda_timeout
      && local.raw_translated_experimental.queue.encryption == var.queue_encryption
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
      && local.raw_translated_experimental.compute_provider.ec2.vpc_id == var.vpc_id
      && local.raw_translated_experimental.compute_provider.ec2.subnet_ids == var.subnet_ids
      && local.raw_translated_experimental.compute_provider.ec2.ami.housekeeper.enabled == var.enable_ami_housekeeper
      && local.raw_translated_experimental.compute_provider.ec2.ami.housekeeper.cleanup_config == var.ami_housekeeper_cleanup_config
      && local.raw_translated_experimental.compute_provider.ec2.ami.housekeeper.artifact.zip == null
      && local.raw_translated_experimental.compute_provider.ec2.ami.housekeeper.artifact.s3.key == var.ami_housekeeper_lambda_s3_key
      && local.raw_translated_experimental.compute_provider.ec2.ami.housekeeper.artifact.s3.object_version == var.ami_housekeeper_lambda_s3_object_version
      && local.raw_translated_experimental.compute_provider.ec2.ami.housekeeper.lambda.memory_size == var.ami_housekeeper_lambda_memory_size
      && local.raw_translated_experimental.compute_provider.ec2.ami.housekeeper.lambda.timeout == var.ami_housekeeper_lambda_timeout
      && local.raw_translated_experimental.compute_provider.ec2.ami.housekeeper.schedule.expression == var.ami_housekeeper_lambda_schedule_expression
      && local.raw_translated_experimental.compute_provider.ec2.instance_termination_watcher.enabled == var.instance_termination_watcher.enable
      && local.raw_translated_experimental.compute_provider.ec2.instance_termination_watcher.features == var.instance_termination_watcher.features
      && local.raw_translated_experimental.compute_provider.ec2.instance_termination_watcher.enable_runner_deregistration == var.instance_termination_watcher.enable_runner_deregistration
      && local.raw_translated_experimental.compute_provider.ec2.instance_termination_watcher.environment_variables == var.instance_termination_watcher.environment_variables
      && local.raw_translated_experimental.compute_provider.ec2.instance_termination_watcher.artifact.zip == null
      && local.raw_translated_experimental.compute_provider.ec2.instance_termination_watcher.artifact.s3.key == var.instance_termination_watcher.s3_key
      && local.raw_translated_experimental.compute_provider.ec2.instance_termination_watcher.artifact.s3.object_version == var.instance_termination_watcher.s3_object_version
      && local.raw_translated_experimental.compute_provider.ec2.instance_termination_watcher.lambda.memory_size == var.instance_termination_watcher.memory_size
      && local.raw_translated_experimental.compute_provider.ec2.instance_termination_watcher.lambda.timeout == var.instance_termination_watcher.timeout
      && local.raw_translated_experimental.compute_provider.ec2.runner_binaries.enabled
      && local.raw_translated_experimental.compute_provider.ec2.runner_binaries.s3.encryption.enabled
      && local.raw_translated_experimental.compute_provider.ec2.runner_binaries.s3.encryption.sse_algorithm == var.runner_binaries_s3_sse_configuration.rule.apply_server_side_encryption_by_default.sse_algorithm
      && local.raw_translated_experimental.compute_provider.ec2.runner_binaries.s3.tags == var.runner_binaries_s3_tags
      && local.raw_translated_experimental.compute_provider.ec2.runner_binaries.s3.versioning == var.runner_binaries_s3_versioning
      && local.raw_translated_experimental.compute_provider.ec2.runner_binaries.syncer.artifact.s3.key == var.syncer_lambda_s3_key
      && local.raw_translated_experimental.compute_provider.ec2.runner_binaries.syncer.artifact.s3.object_version == var.syncer_lambda_s3_object_version
      && local.raw_translated_experimental.compute_provider.ec2.runner_binaries.syncer.lambda.memory_size == var.runner_binaries_syncer_memory_size
      && local.raw_translated_experimental.compute_provider.ec2.runner_binaries.syncer.lambda.timeout == var.runner_binaries_syncer_lambda_timeout
      && local.raw_translated_experimental.compute_provider.ec2.runner_binaries.syncer.schedule.state == var.state_event_rule_binaries_syncer
      && local.raw_translated_experimental.multi_runner_config["linux"].runner.os == var.multi_runner_config["linux"].runner_config.runner_os
      && local.raw_translated_experimental.multi_runner_config["linux"].runner.architecture == var.multi_runner_config["linux"].runner_config.runner_architecture
      && local.raw_translated_experimental.multi_runner_config["linux"].runner.maximum_count == var.multi_runner_config["linux"].runner_config.runners_maximum_count
      && local.raw_translated_experimental.multi_runner_config["linux"].github.organization_runners == var.multi_runner_config["linux"].runner_config.enable_organization_runners
      && local.raw_translated_experimental.multi_runner_config["linux"].lambda.scale_up.event_source_mapping.batch_size == var.multi_runner_config["linux"].runner_config.lambda_event_source_mapping_batch_size
      && local.raw_translated_experimental.multi_runner_config["linux"].queue.delay_webhook_event == var.multi_runner_config["linux"].runner_config.delay_webhook_event
      && local.raw_translated_experimental.multi_runner_config["linux"].queue.job_queue_retention_in_seconds == var.multi_runner_config["linux"].runner_config.job_queue_retention_in_seconds
      && local.raw_translated_experimental.multi_runner_config["linux"].queue.visibility_timeout_seconds == var.runners_scale_up_lambda_timeout
      && local.raw_translated_experimental.multi_runner_config["linux"].queue.redrive_build_queue == var.multi_runner_config["linux"].redrive_build_queue
      && local.raw_translated_experimental.multi_runner_config["linux"].compute_provider.ec2.binaries_syncer.enabled
      && local.raw_translated_experimental.multi_runner_config["linux"].matcherConfig == var.multi_runner_config["linux"].matcherConfig
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
    condition     = keys(local.runner_config_by_provider.ec2) == ["linux"]
    error_message = "Stable multi_runner_config entries must route to the EC2 provider."
  }

  assert {
    condition = (
      !local.use_multi_runner_config_v2
      && toset(keys(local.raw_translated_experimental.multi_runner_config)) == toset(["linux"])
      && toset(keys(local.translated_experimental.multi_runner_config)) == toset(["linux"])
      && length(module.runner_stacks) == 0
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
      && local.translated_experimental.multi_runner_config["linux"].github.organization_runners
    )
    error_message = "Stable module inputs must use the canonical translated lane while retaining stable module.runners ownership."
  }

  assert {
    condition     = keys(module.runners) == ["linux"] && length(module.runner_stacks) == 0
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

run "experimental_v2_routes_through_provider_stack" {
  command = plan

  variables {
    additional_github_apps = [{
      id_ssm = {
        name = "/github-runner/additional-app-id"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/additional-app-id"
      }
      key_base64_ssm = {
        name = "/github-runner/additional-key-base64"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/additional-key-base64"
      }
      installation_id_ssm = {
        name = "/github-runner/additional-installation-id"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/additional-installation-id"
      }
    }]

    tags = {
      FlatModule = "ignored"
    }

    repository_white_list    = ["flat-owner/flat-repository"]
    queue_selection_strategy = "all"
    eventbridge = {
      enable        = false
      accept_events = ["workflow_job"]
    }
    matcher_config_parameter_store_tier = "Advanced"
    webhook_lambda_apigateway_access_log_settings = {
      destination_arn = "arn:aws:logs:eu-west-1:123456789012:log-group:flat-api-access"
      format          = "$context.requestId"
    }
    webhook_lambda_s3_object_version = "flat-webhook-version"

    role_path                 = "/flat-role/"
    role_permissions_boundary = "arn:aws:iam::123456789012:policy/flat-boundary"
    ghes_url                  = "https://flat.example.com"
    ghes_ssl_verify           = false
    user_agent                = "flat-user-agent"

    lambda_runtime            = "nodejs20.x"
    lambda_architecture       = "x86_64"
    runners_lambda_zip        = "flat-runners-ignored.zip"
    lambda_subnet_ids         = ["subnet-flat-lambda"]
    lambda_security_group_ids = ["sg-flat-lambda"]
    lambda_principals = [{
      type        = "AWS"
      identifiers = ["arn:aws:iam::123456789012:role/flat-lambda-principal"]
    }]
    scale_up_lambda_memory_size                                    = 600
    runners_scale_up_lambda_timeout                                = 45
    scale_down_lambda_memory_size                                  = 700
    runners_scale_down_lambda_timeout                              = 75
    webhook_lambda_memory_size                                     = 384
    webhook_lambda_timeout                                         = 20
    runner_binaries_syncer_memory_size                             = 704
    runner_binaries_syncer_lambda_timeout                          = 80
    pool_lambda_timeout                                            = 90
    pool_lambda_reserved_concurrent_executions                     = 3
    lambda_event_source_mapping_batch_size                         = 7
    lambda_event_source_mapping_maximum_batching_window_in_seconds = 2
    log_level                                                      = "error"
    logging_retention_in_days                                      = 60
    logging_kms_key_id                                             = "arn:aws:kms:eu-west-1:123456789012:key/flat-logs"
    log_class                                                      = "INFREQUENT_ACCESS"
    kms_key_arn                                                    = null

    queue_encryption = {
      kms_data_key_reuse_period_seconds = 600
      kms_master_key_id                 = "arn:aws:kms:eu-west-1:123456789012:key/flat-queue"
      sqs_managed_sse_enabled           = null
    }

    lambda_tags = {
      FlatLambda = "ignored"
    }

    enable_managed_runner_security_group = false
    runner_additional_security_group_ids = ["sg-flat-runner"]
    cloudwatch_config                    = "flat-cloudwatch-config"
    instance_profile_path                = "/flat-instance-profile/"
    key_name                             = "flat-key"
    associate_public_ipv4_address        = true

    runner_egress_rules = [{
      cidr_blocks      = ["10.0.0.0/8"]
      ipv6_cidr_blocks = []
      prefix_list_ids  = []
      from_port        = 443
      protocol         = "tcp"
      security_groups  = []
      self             = false
      to_port          = 443
      description      = "flat-only"
    }]

    tracing_config = {
      mode                  = "Active"
      capture_http_requests = true
      capture_error         = false
    }

    metrics = {
      enable    = true
      namespace = "FlatMetrics"
      metric = {
        enable_github_app_rate_limit    = false
        enable_job_retry                = true
        enable_spot_termination_warning = false
      }
    }

    ssm_paths = {
      root    = "flat-root"
      app     = "flat-app"
      runners = "flat-runners"
      webhook = "flat-webhook"
    }

    parameter_store_tags = {
      FlatParameter = "flat"
    }

    runners_ssm_housekeeper = {
      schedule_expression = "rate(8 hours)"
      enabled             = false
      lambda_memory_size  = 640
      lambda_timeout      = 55
      config = {
        tokenPath      = "/flat/cleanup/tokens"
        minimumDaysOld = 4
        dryRun         = true
      }
    }

    instance_termination_watcher = {
      enable      = true
      memory_size = 900
      timeout     = 90
      s3_key      = "flat-termination-watcher.zip"
      environment_variables = {
        FLAT_WATCHER = "ignored"
      }
    }

    enable_ami_housekeeper                     = true
    ami_housekeeper_lambda_memory_size         = 900
    ami_housekeeper_lambda_timeout             = 90
    ami_housekeeper_lambda_s3_key              = "flat-ami-housekeeper.zip"
    ami_housekeeper_lambda_schedule_expression = "rate(1 hour)"

    multi_runner_config = {
      legacy = {
        runner_config = {
          runner_os                     = "linux"
          runner_architecture           = "x64"
          instance_types                = ["t3.large"]
          runners_maximum_count         = 1
          enable_runner_binaries_syncer = false
        }
        matcherConfig = {
          labelMatchers = [["self-hosted", "linux", "x64", "legacy"]]
        }
      }
    }

    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
        additional_apps = [{
          id_ssm = {
            name = "/github-runner/additional-app-id"
            arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/additional-app-id"
          }
          key_base64_ssm = {
            name = "/github-runner/additional-key-base64"
            arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/additional-key-base64"
          }
          installation_id_ssm = {
            name = "/github-runner/additional-installation-id"
            arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/additional-installation-id"
          }
        }]
      }

      lambda = {
        scale = {
          artifact = {
            zip = "README.md"
          }
        }
        webhook = {
          artifact = {
            zip = "README.md"
          }
        }
      }

      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-experimental-defaults"
          subnet_ids = ["subnet-experimental-defaults"]
          runner_binaries = {
            syncer = {
              artifact = {
                zip = "README.md"
              }
            }
          }
        }
      }

      multi_runner_config = {
        linux = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
            hooks = {
              job_started = "/opt/actions/job-started.sh"
            }
            iam = {
              managed_policy_arns = {
                readonly = "arn:aws:iam::aws:policy/ReadOnlyAccess"
              }
            }
          }
          github = {
            organization_runners = true
          }
          lambda = {
            scale_down = {
              idle_config = [{
                cron      = "* * * * *"
                timeZone  = "UTC"
                idleCount = 1
              }]
            }
            pool = {
              config = [{
                schedule_expression = "cron(0 8 * * ? *)"
                size                = 1
              }]
            }
          }
          compute_provider = {
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = true
              }
            }
          }
          matcherConfig = {
            labelMatchers       = [["self-hosted", "linux", "x64"]]
            enableDynamicLabels = true
            awsDynamicLabelsPolicy = {
              blocked_keys = ["image-id"]
              restricted_keys = {
                "instance-type" = {
                  allowed = ["m5.*", "c5.*"]
                  denied  = ["*.metal"]
                }
                "ebs-volume-size" = {
                  max = 200
                }
              }
            }
          }
        }
      }
    }
  }

  assert {
    condition = (
      local.use_multi_runner_config_v2
      && jsonencode(local.raw_translated_experimental) == jsonencode(var.experimental)
    )
    error_message = "A non-empty experimental v2 map must pass through the exact experimental object without translation-time default resolution or stable-input fallback."
  }

  assert {
    condition     = keys(local.runner_config_by_provider.ec2) == ["linux"]
    error_message = "Experimental multi_runner_config entries must route to the EC2 provider."
  }

  assert {
    condition = (
      local.compute_provider_types["linux"] == "ec2"
      && local.runner_matcher_config["linux"].computeProvider == "ec2"
    )
    error_message = "Compute-provider selection must supply the webhook routing contract."
  }

  assert {
    condition     = toset(keys(module.runner_stacks)) == toset(["linux"]) && toset(keys(local.translated_experimental.multi_runner_config)) == toset(["linux"])
    error_message = "Experimental multi_runner_config entries must remain isolated in the v2 configuration map."
  }

  assert {
    condition = (
      toset(keys(local.translated_experimental_base.multi_runner_config["linux"].compute_provider.ec2.binaries_syncer)) == toset(["enabled"])
      && toset(keys(local.translated_experimental.multi_runner_config["linux"].compute_provider.ec2.binaries_syncer)) == toset(["enabled", "s3"])
      && local.translated_experimental.multi_runner_config["linux"].compute_provider.ec2.binaries_syncer.s3 != null
      && keys(output.binaries_syncer_map) == ["linux_x64"]
    )
    error_message = "V2 binary discovery must use the pure base lane, enrich the final canonical lane with S3, and create the corresponding shared syncer resources."
  }

  assert {
    condition     = toset(flatten(local.translated_experimental.multi_runner_config["linux"].matcherConfig.labelMatchers)) == toset(["self-hosted", "linux", "x64"])
    error_message = "The canonical experimental lane must retain labels declared by its matcher configuration for the runner adapter."
  }

  assert {
    condition = (
      local.runner_matcher_config["linux"].matcherConfig.awsDynamicLabelsPolicy.blocked_keys == tolist(["image-id"])
      && local.runner_matcher_config["linux"].matcherConfig.awsDynamicLabelsPolicy.restricted_keys["instance-type"].allowed == tolist(["m5.*", "c5.*"])
      && local.runner_matcher_config["linux"].matcherConfig.awsDynamicLabelsPolicy.restricted_keys["instance-type"].denied == tolist(["*.metal"])
      && local.runner_matcher_config["linux"].matcherConfig.awsDynamicLabelsPolicy.restricted_keys["ebs-volume-size"].max == "200"
    )
    error_message = "Experimental matcher config must preserve the typed AWS dynamic-label policy contract."
  }

  assert {
    condition     = length(module.runners) == 0 && keys(module.runner_stacks) == ["linux"]
    error_message = "A non-empty experimental.multi_runner_config map must take priority over stable multi_runner_config and dispatch only through module.runner_stacks."
  }

  assert {
    condition = (
      length(local.translated_experimental.tags) == 0
      && local.translated_experimental.roles.path == null
      && local.translated_experimental.roles.permissions_boundary == null
      && local.translated_experimental.multi_runner_config["linux"].runner.boot_time_in_minutes == 5
      && !local.translated_experimental.multi_runner_config["linux"].runner.disable_default_labels
      && local.translated_experimental.multi_runner_config["linux"].runner.group_name == "Default"
      && local.translated_experimental.multi_runner_config["linux"].runner.name_prefix == ""
      && !local.translated_experimental.multi_runner_config["linux"].runner.run_as_root
      && local.translated_experimental.multi_runner_config["linux"].runner.run_as == "ec2-user"
      && !local.translated_experimental.multi_runner_config["linux"].runner.ephemeral
      && local.translated_experimental.multi_runner_config["linux"].runner.jit_config_enabled == null
      && !local.translated_experimental.multi_runner_config["linux"].runner.auto_update_disabled
      && local.translated_experimental.multi_runner_config["linux"].runner.hooks.job_completed == ""
      && local.translated_experimental.multi_runner_config["linux"].runner.iam.path == null
      && local.translated_experimental.multi_runner_config["linux"].runner.iam.permissions_boundary == null
    )
    error_message = "Experimental v2 runner, tag, and role defaults must be self-contained and must not inherit deliberately different stable inputs."
  }

  assert {
    condition = (
      local.translated_experimental.lambda.scale.artifact.zip == "README.md"
      && local.translated_experimental.lambda.scale.artifact.s3 == null
      && local.translated_experimental.lambda.artifact.s3.bucket == null
      && local.translated_experimental.multi_runner_config["linux"].lambda.zip == "README.md"
      && local.translated_experimental.multi_runner_config["linux"].lambda.s3.bucket == null
      && local.translated_experimental.multi_runner_config["linux"].lambda.s3.key == null
      && local.translated_experimental.multi_runner_config["linux"].lambda.s3.object_version == null
      && length(local.translated_experimental.lambda.principals) == 0
      && local.translated_experimental.multi_runner_config["linux"].lambda.runtime == "nodejs24.x"
      && local.translated_experimental.multi_runner_config["linux"].lambda.architecture == "arm64"
      && length(local.translated_experimental.multi_runner_config["linux"].lambda.subnet_ids) == 0
      && length(local.translated_experimental.multi_runner_config["linux"].lambda.security_group_ids) == 0
      && length(local.translated_experimental.multi_runner_config["linux"].lambda.tags) == 0
      && local.translated_experimental.multi_runner_config["linux"].lambda.role.path == null
      && local.translated_experimental.multi_runner_config["linux"].lambda.role.permissions_boundary == null
      && module.runner_stacks["linux"].scale_up.lambda.runtime == "nodejs24.x"
      && module.runner_stacks["linux"].scale_up.lambda.filename == "README.md"
      && module.runner_stacks["linux"].scale_up.lambda.s3_bucket == null
      && module.runner_stacks["linux"].scale_up.lambda.memory_size == 512
      && module.runner_stacks["linux"].scale_up.lambda.timeout == 30
      && local.translated_experimental.multi_runner_config["linux"].lambda.scale_up.reserved_concurrent_executions == 1
      && local.translated_experimental.multi_runner_config["linux"].lambda.scale_up.job_queued_check_enabled == null
      && local.translated_experimental.multi_runner_config["linux"].lambda.scale_up.event_source_mapping.batch_size == 10
      && local.translated_experimental.multi_runner_config["linux"].lambda.scale_up.event_source_mapping.maximum_batching_window_in_seconds == 0
      && module.runner_stacks["linux"].scale_down.lambda.memory_size == 512
      && module.runner_stacks["linux"].scale_down.lambda.timeout == 60
      && local.translated_experimental.multi_runner_config["linux"].lambda.scale_down.schedule_expression == "cron(*/5 * * * ? *)"
      && local.translated_experimental.multi_runner_config["linux"].lambda.scale_down.minimum_running_time_in_minutes == null
      && module.runner_stacks["linux"].pool.lambda.memory_size == 512
      && module.runner_stacks["linux"].pool.lambda.timeout == 60
      && local.translated_experimental.multi_runner_config["linux"].lambda.pool.reserved_concurrent_executions == 1
      && !local.translated_experimental.multi_runner_config["linux"].lambda.pool.include_busy_runners
      && local.translated_experimental.multi_runner_config["linux"].lambda.pool.runner_owner == null
    )
    error_message = "Experimental v2 runner-stack Lambda components must inherit the concrete nested defaults and ignore every corresponding stable Lambda input."
  }

  assert {
    condition = (
      local.translated_experimental.multi_runner_config["linux"].queue.delay_webhook_event == 30
      && local.translated_experimental.multi_runner_config["linux"].queue.job_queue_retention_in_seconds == 86400
      && local.translated_experimental.multi_runner_config["linux"].queue.visibility_timeout_seconds == 180
      && !local.translated_experimental.multi_runner_config["linux"].queue.redrive_build_queue.enabled
      && length(local.translated_experimental.multi_runner_config["linux"].queue.tags) == 0
      && local.translated_experimental.queue.encryption == var.experimental.queue.encryption
      && local.translated_experimental.queue.encryption.sqs_managed_sse_enabled
      && local.translated_experimental.queue.encryption.kms_master_key_id == null
      && local.translated_experimental.queue.encryption.kms_data_key_reuse_period_seconds == null
      && aws_sqs_queue.queued_builds["linux"].delay_seconds == 30
      && aws_sqs_queue.queued_builds["linux"].message_retention_seconds == 86400
      && aws_sqs_queue.queued_builds["linux"].visibility_timeout_seconds == 180
      && aws_sqs_queue.queued_builds["linux"].sqs_managed_sse_enabled
      && aws_sqs_queue.queued_builds["linux"].kms_master_key_id == null
    )
    error_message = "Experimental v2 queues must use concrete nested defaults, including a six-times-Lambda visibility timeout and SQS-managed encryption, instead of flat queue inputs."
  }

  assert {
    condition = (
      local.translated_experimental.github.app == var.experimental.github.app
      && local.translated_experimental.github.additional_apps == var.experimental.github.additional_apps
      && length(local.translated_experimental.github.repository_white_list) == 0
      && local.translated_experimental.github.enterprise_server == var.experimental.github.enterprise_server
      && local.translated_experimental.github.user_agent == var.experimental.github.user_agent
      && local.translated_experimental.github.enterprise_server.url == null
      && local.translated_experimental.github.enterprise_server.ssl_verify
      && local.translated_experimental.github.user_agent == "github-aws-runners"
      && module.runner_stacks["linux"].scale_up.lambda.environment[0].variables["GHES_URL"] == null
      && module.runner_stacks["linux"].scale_up.lambda.environment[0].variables["NODE_TLS_REJECT_UNAUTHORIZED"] == "1"
      && module.runner_stacks["linux"].scale_up.lambda.environment[0].variables["USER_AGENT"] == "github-aws-runners"
      && module.runner_stacks["linux"].scale_down.lambda.environment[0].variables["USER_AGENT"] == "github-aws-runners"
      && module.runner_stacks["linux"].pool.lambda.environment[0].variables["USER_AGENT"] == "github-aws-runners"
    )
    error_message = "V2 runner stacks must use concrete nested GitHub connection defaults rather than deliberately different flat GHES and user-agent inputs."
  }

  assert {
    condition = (
      local.translated_experimental.webhook.queue_selection_strategy == "first"
      && local.translated_experimental.webhook.eventbridge.enable
      && length(local.translated_experimental.webhook.eventbridge.accept_events) == 0
      && local.translated_experimental.webhook.matcher_config_parameter_store_tier == "Standard"
      && local.translated_experimental.lambda.webhook.artifact.zip == "README.md"
      && local.translated_experimental.lambda.webhook.artifact.s3 == null
      && local.translated_experimental.lambda.webhook.api_gateway_access_log_settings == null
      && local.translated_experimental.lambda.scale_up.event_source_mapping.batch_size == 10
      && local.translated_experimental.lambda.scale_up.event_source_mapping.maximum_batching_window_in_seconds == 0
    )
    error_message = "V2 webhook controls, the explicitly nested local artifact, API access-log defaults, and scale-up event-source mappings must avoid flat-input fallback."
  }

  assert {
    condition = (
      local.translated_experimental.multi_runner_config["linux"].observability.logs.level == "info"
      && local.translated_experimental.multi_runner_config["linux"].observability.logs.retention_in_days == 180
      && local.translated_experimental.multi_runner_config["linux"].observability.logs.kms_key_id == null
      && local.translated_experimental.multi_runner_config["linux"].observability.logs.class == "STANDARD"
      && length(local.translated_experimental.multi_runner_config["linux"].observability.logs.tags) == 0
      && local.translated_experimental.multi_runner_config["linux"].observability.tracing.mode == null
      && !local.translated_experimental.multi_runner_config["linux"].observability.tracing.capture_http_requests
      && !local.translated_experimental.multi_runner_config["linux"].observability.tracing.capture_error
      && !local.translated_experimental.multi_runner_config["linux"].observability.metrics.enable
      && local.translated_experimental.multi_runner_config["linux"].observability.metrics.namespace == "GitHub Runners"
      && local.translated_experimental.multi_runner_config["linux"].observability.metrics.metric.enable_github_app_rate_limit
      && local.translated_experimental.multi_runner_config["linux"].observability.metrics.metric.enable_job_retry
    )
    error_message = "Experimental v2 observability must use its concrete nested logging, tracing, and metrics defaults instead of stable inputs."
  }

  assert {
    condition = (
      local.translated_experimental.multi_runner_config["linux"].ssm.paths.root == "/github-action-runners/github-actions/linux"
      && local.translated_experimental.multi_runner_config["linux"].ssm.paths.tokens == "runners/tokens"
      && local.translated_experimental.multi_runner_config["linux"].ssm.paths.config == "runners/config"
      && var.kms_key_arn == null
      && local.translated_experimental.ssm.kms_key_id == null
      && length(local.translated_experimental.multi_runner_config["linux"].ssm.tags) == 0
      && length(local.translated_experimental.multi_runner_config["linux"].ssm.parameters.tags) == 0
      && local.translated_experimental.multi_runner_config["linux"].ssm.housekeeper.schedule_expression == "rate(1 day)"
      && local.translated_experimental.multi_runner_config["linux"].ssm.housekeeper.state == "ENABLED"
      && local.translated_experimental.multi_runner_config["linux"].ssm.housekeeper.lambda.memory_size == 512
      && local.translated_experimental.multi_runner_config["linux"].ssm.housekeeper.lambda.timeout == 60
      && local.translated_experimental.multi_runner_config["linux"].ssm.housekeeper.config.tokenPath == null
      && local.translated_experimental.multi_runner_config["linux"].ssm.housekeeper.config.minimumDaysOld == 1
      && !local.translated_experimental.multi_runner_config["linux"].ssm.housekeeper.config.dryRun
    )
    error_message = "Experimental v2 SSM must use self-contained path, tag, and housekeeper defaults without deriving ownership or values from stable SSM inputs."
  }

  assert {
    condition = (
      module.runner_stacks["linux"].scale_up.lambda.environment[0].variables["LOG_LEVEL"] == "INFO"
      && module.runner_stacks["linux"].scale_up.lambda.environment[0].variables["POWERTOOLS_METRICS_NAMESPACE"] == "GitHub Runners"
      && module.runner_stacks["linux"].scale_up.lambda.environment[0].variables["POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS"] == "false"
      && module.runner_stacks["linux"].scale_up.lambda.environment[0].variables["POWERTOOLS_TRACER_CAPTURE_ERROR"] == "false"
      && module.runner_stacks["linux"].scale_up.lambda.environment[0].variables["SSM_TOKEN_PATH"] == "/github-action-runners/github-actions/linux/runners/tokens"
      && module.runner_stacks["linux"].scale_up.lambda.environment[0].variables["SSM_CONFIG_PATH"] == "/github-action-runners/github-actions/linux/runners/config"
      && module.runner_stacks["linux"].scale_up.log_group.retention_in_days == 180
      && module.runner_stacks["linux"].scale_up.log_group.kms_key_id == null
      && module.runner_stacks["linux"].scale_up.log_group.log_group_class == "STANDARD"
      && length(module.runner_stacks["linux"].scale_up.lambda.tracing_config) == 0
      && jsondecode(module.runner_stacks["linux"].scale_up.lambda.environment[0].variables["SSM_PARAMETER_STORE_TAGS"]) == [{
        Key   = "ghr:environment"
        Value = "github-actions"
      }]
    )
    error_message = "Concrete experimental observability and SSM defaults must reach runner-stack resources without stable-input leakage."
  }

  assert {
    condition = (
      output.webhook.lambda.runtime == "nodejs24.x"
      && output.webhook.lambda.architectures == tolist(["arm64"])
      && output.webhook.lambda.memory_size == 256
      && output.webhook.lambda.timeout == 10
      && output.webhook.lambda.s3_bucket == null
      && output.webhook.lambda.s3_key == null
      && output.webhook.lambda.s3_object_version == null
      && length(output.webhook.lambda.vpc_config) == 1
      && length(output.webhook.lambda.vpc_config[0].subnet_ids) == 0
      && length(output.webhook.lambda.vpc_config[0].security_group_ids) == 0
      && !contains(keys(output.webhook.lambda.tags), "FlatModule")
      && !contains(keys(output.webhook.lambda.tags), "FlatLambda")
      && output.webhook.lambda_role.path == "/github-actions/"
      && output.webhook.lambda_role.permissions_boundary == null
      && output.webhook.eventbridge != null
      && output.webhook.dispatcher != null
      && jsondecode(output.webhook.dispatcher.lambda.environment[0].variables["REPOSITORY_ALLOW_LIST"]) == []
      && output.webhook.dispatcher.lambda.environment[0].variables["QUEUE_SELECTION_STRATEGY"] == "first"
      && output.webhook.lambda.environment[0].variables["PARAMETER_RUNNER_MATCHER_CONFIG_PATH"] == "/github-action-runners/github-actions/webhook/runner-matcher-config"
      && output.webhook.lambda.environment[0].variables["LOG_LEVEL"] == "INFO"
      && output.webhook.lambda.environment[0].variables["POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS"] == "false"
      && output.webhook.lambda.environment[0].variables["POWERTOOLS_TRACER_CAPTURE_ERROR"] == "false"
      && length(output.webhook.lambda.tracing_config) == 0
      && output.webhook.lambda_log_group.retention_in_days == 180
      && output.webhook.lambda_log_group.kms_key_id == null
      && output.webhook.lambda_log_group.log_group_class == "STANDARD"
      && var.kms_key_arn == null
    )
    error_message = "The shared webhook must use translated v2 Lambda, nested artifact, network, tag, role, SSM/KMS, and observability values without flat-input leakage."
  }

  assert {
    condition = (
      local.translated_experimental.ssm.paths.app == "app"
      && output.ssm_parameters.id.name == "/github-action-runners/github-actions/app/github_app_id"
    )
    error_message = "Shared SSM parameters must use the translated v2 root and app defaults instead of flat ssm_paths."
  }

  assert {
    condition = (
      local.translated_experimental.compute_provider.ec2.runner_binaries.enabled
      && local.translated_experimental.compute_provider.ec2.runner_binaries.s3.encryption.enabled
      && local.translated_experimental.compute_provider.ec2.runner_binaries.s3.encryption.sse_algorithm == "AES256"
      && local.translated_experimental.compute_provider.ec2.runner_binaries.s3.encryption.kms_master_key_id == null
      && local.translated_experimental.compute_provider.ec2.runner_binaries.s3.versioning == "Disabled"
      && local.translated_experimental.compute_provider.ec2.runner_binaries.s3.logging.bucket == null
      && local.translated_experimental.compute_provider.ec2.runner_binaries.s3.logging.prefix == null
      && local.translated_experimental.compute_provider.ec2.runner_binaries.syncer.artifact.zip == "README.md"
      && local.translated_experimental.compute_provider.ec2.runner_binaries.syncer.artifact.s3 == null
      && local.translated_experimental.compute_provider.ec2.runner_binaries.syncer.lambda.memory_size == 256
      && local.translated_experimental.compute_provider.ec2.runner_binaries.syncer.lambda.timeout == 300
      && local.translated_experimental.compute_provider.ec2.runner_binaries.syncer.schedule.expression == "cron(27 * * * ? *)"
      && local.translated_experimental.compute_provider.ec2.runner_binaries.syncer.schedule.state == "ENABLED"
    )
    error_message = "The nested v2 runner-binary block must own concrete defaults independently of matching flat syncer and bucket inputs."
  }

  assert {
    condition = (
      keys(output.binaries_syncer_map) == ["linux_x64"]
      && output.binaries_syncer_map["linux_x64"].lambda.runtime == "nodejs24.x"
      && output.binaries_syncer_map["linux_x64"].lambda.architectures == tolist(["arm64"])
      && output.binaries_syncer_map["linux_x64"].lambda.memory_size == 256
      && output.binaries_syncer_map["linux_x64"].lambda.timeout == 300
      && output.binaries_syncer_map["linux_x64"].lambda.filename == "README.md"
      && output.binaries_syncer_map["linux_x64"].lambda.s3_bucket == null
      && output.binaries_syncer_map["linux_x64"].lambda.s3_key == null
      && output.binaries_syncer_map["linux_x64"].lambda.s3_object_version == null
      && length(output.binaries_syncer_map["linux_x64"].lambda.vpc_config) == 1
      && length(output.binaries_syncer_map["linux_x64"].lambda.vpc_config[0].subnet_ids) == 0
      && length(output.binaries_syncer_map["linux_x64"].lambda.vpc_config[0].security_group_ids) == 0
      && !contains(keys(output.binaries_syncer_map["linux_x64"].lambda.tags), "FlatModule")
      && !contains(keys(output.binaries_syncer_map["linux_x64"].lambda.tags), "FlatLambda")
      && output.binaries_syncer_map["linux_x64"].lambda_role.path == "/github-actions-linux-x64/"
      && output.binaries_syncer_map["linux_x64"].lambda_role.permissions_boundary == null
      && output.binaries_syncer_map["linux_x64"].lambda.environment[0].variables["LOG_LEVEL"] == "INFO"
      && length(output.binaries_syncer_map["linux_x64"].lambda.tracing_config) == 0
      && output.binaries_syncer_map["linux_x64"].lambda_log_group.retention_in_days == 180
      && output.binaries_syncer_map["linux_x64"].lambda_log_group.kms_key_id == null
      && output.binaries_syncer_map["linux_x64"].lambda_log_group.log_group_class == "STANDARD"
    )
    error_message = "The v2 binary syncer must inherit translated global Lambda, role, tags, observability, artifact, and component defaults without flat-input leakage."
  }

  assert {
    condition = (
      local.translated_experimental.multi_runner_config["linux"].compute_provider.ec2.vpc_id == "vpc-experimental-defaults"
      && local.translated_experimental.multi_runner_config["linux"].compute_provider.ec2.subnet_ids == tolist(["subnet-experimental-defaults"])
      && local.translated_experimental.multi_runner_config["linux"].compute_provider.ec2.managed_security_group_enabled
      && length(local.translated_experimental.multi_runner_config["linux"].compute_provider.ec2.egress_rules) == 1
      && local.translated_experimental.multi_runner_config["linux"].compute_provider.ec2.egress_rules[0].cidr_blocks == tolist(["0.0.0.0/0"])
      && local.translated_experimental.multi_runner_config["linux"].compute_provider.ec2.egress_rules[0].ipv6_cidr_blocks == tolist(["::/0"])
      && local.translated_experimental.multi_runner_config["linux"].compute_provider.ec2.egress_rules[0].protocol == "-1"
      && length(local.translated_experimental.multi_runner_config["linux"].compute_provider.ec2.additional_security_group_ids) == 0
      && local.translated_experimental.multi_runner_config["linux"].compute_provider.ec2.cloudwatch_agent.config == null
      && local.translated_experimental.multi_runner_config["linux"].compute_provider.ec2.instance_profile_path == null
      && local.translated_experimental.multi_runner_config["linux"].compute_provider.ec2.key_name == null
      && !local.translated_experimental.multi_runner_config["linux"].compute_provider.ec2.associate_public_ipv4_address
      && length(local.translated_experimental.multi_runner_config["linux"].compute_provider.ec2.tags) == 0
      && !local.translated_experimental.compute_provider.ec2.ami.housekeeper.enabled
      && !local.translated_experimental.compute_provider.ec2.instance_termination_watcher.enabled
      && length(module.ami_housekeeper) == 0
      && length(module.instance_termination_watcher) == 0
      && output.instance_termination_watcher == null
    )
    error_message = "V2 EC2 lanes must use nested network inputs and concrete nested EC2 defaults instead of corresponding stable inputs."
  }

  assert {
    condition = (
      local.translated_experimental.github.app == var.experimental.github.app
      && local.translated_experimental.github.additional_apps == var.experimental.github.additional_apps
      && local.translated_experimental.github.app == var.github_app
      && local.translated_experimental.github.additional_apps == var.additional_github_apps
      && length(local.github_app_parameters.id) == 2
      && length(module.ssm.additional_app_parameters) == 1
      && module.ssm.additional_app_parameters[0].id.name == "/github-runner/additional-app-id"
      && module.runner_stacks["linux"].scale_up.lambda.environment[0].variables["PARAMETER_GITHUB_APP_ID_NAME"] == join(":", [for p in local.github_app_parameters.id : p.name])
      && module.runner_stacks["linux"].scale_down.lambda.environment[0].variables["PARAMETER_GITHUB_APP_KEY_BASE64_NAME"] == join(":", [for p in local.github_app_parameters.key_base64 : p.name])
      && module.runner_stacks["linux"].pool.lambda.environment[0].variables["PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME"] == join(":", [for p in local.github_app_parameters.installation_id : p != null ? p.name : ""])
    )
    error_message = "Experimental v2 control-plane Lambdas must preserve the complete multi-app parameter lists from the shared multi-runner configuration."
  }

  assert {
    condition     = keys(aws_sqs_queue.queued_builds) == ["linux"] && keys(local.runner_matcher_config) == ["linux"]
    error_message = "Common queues and webhook matcher configuration must contain only the selected experimental runner configuration key."
  }

  assert {
    condition     = length(output.runners_map) == 0
    error_message = "Experimental multi_runner_config must not add nested entries to the stable runners_map output."
  }

  assert {
    condition     = keys(output.runners_map_v2) == ["linux"]
    error_message = "Experimental multi_runner_config must expose its runner configuration key through runners_map_v2."
  }

  assert {
    condition = toset(keys(output.runners_map_v2["linux"])) == toset(
      [
        "provider",
        "runner",
        "scale_up",
        "scale_down",
        "pool",
      ]
    )
    error_message = "Experimental v2 runners_map_v2 entries must group common and provider resources by owner."
  }

  assert {
    condition = (
      toset(keys(output.runners_map_v2["linux"].runner)) == toset(["role"])
      && toset(keys(output.runners_map_v2["linux"].scale_up)) == toset(["lambda", "log_group", "role"])
      && toset(keys(output.runners_map_v2["linux"].scale_down)) == toset(["lambda", "log_group", "role"])
      && toset(keys(output.runners_map_v2["linux"].pool)) == toset(["lambda", "log_group", "role"])
    )
    error_message = "Experimental v2 common resources must use the nested runner, scale-up, scale-down, and pool contracts."
  }

  assert {
    condition = (
      toset(keys(output.runners_map_v2["linux"].provider)) == toset(["ec2"])
      && toset(keys(output.runners_map_v2["linux"].provider.ec2)) == toset([
        "launch_template",
        "runners_log_groups",
        "logfiles",
      ])
    )
    error_message = "Experimental v2 must expose only EC2-owned resources under runners_map_v2.<configuration>.provider.ec2."
  }

  assert {
    condition = (
      !contains(keys(output.runners_map_v2["linux"]), "launch_template_name")
      && output.runners_map_v2["linux"].runner.role != null
      && !contains(keys(output.runners_map_v2["linux"].provider.ec2), "role_runner")
      && !contains(keys(output.runners_map_v2["linux"]), "runners_log_groups")
      && !contains(keys(output.runners_map_v2["linux"]), "logfiles")
    )
    error_message = "Experimental v2 must expose only its nested schema through runners_map_v2 without legacy flat fields."
  }

  assert {
    condition     = local.runner_config_by_provider.ec2["linux"].lambda.scale_down.idle_config[0].idleCount == 1
    error_message = "Provider-neutral idle configuration must remain in the common runner contract."
  }

  assert {
    condition     = local.runner_config_by_provider.ec2["linux"].runner.iam.managed_policy_arns.readonly == "arn:aws:iam::aws:policy/ReadOnlyAccess"
    error_message = "Runner-role policies must remain in the common runner contract."
  }

  assert {
    condition = (
      local.runner_config_by_provider.ec2["linux"].runner.hooks.job_started == "/opt/actions/job-started.sh"
      && !contains(keys(local.runner_config_by_provider.ec2["linux"].compute_provider.ec2), "hooks")
    )
    error_message = "Runner lifecycle hooks must remain in the common runner contract."
  }
}

run "experimental_v2_applies_global_defaults_and_lane_overrides" {
  command = plan

  variables {
    lambda_runtime                   = "nodejs20.x"
    lambda_s3_bucket                 = "flat-lambda-artifacts"
    role_path                        = "/flat/"
    runner_egress_rules              = null
    ghes_url                         = "https://flat-termination.example.com"
    ghes_ssl_verify                  = true
    user_agent                       = "flat-shared-user-agent"
    kms_key_arn                      = "arn:aws:kms:eu-west-1:123456789012:key/experimental-queue"
    runners_lambda_s3_key            = "flat-runners-ignored.zip"
    runners_lambda_s3_object_version = "flat-runners-ignored-version"
    repository_white_list            = ["flat-owner/flat-repository"]
    queue_selection_strategy         = "random"
    eventbridge = {
      enable        = true
      accept_events = ["push"]
    }
    matcher_config_parameter_store_tier = "Standard"
    webhook_lambda_apigateway_access_log_settings = {
      destination_arn = "arn:aws:logs:eu-west-1:123456789012:log-group:flat-api-access"
      format          = "$context.requestId"
    }
    webhook_lambda_s3_object_version = "flat-webhook-version"

    lambda_principals = [{
      type        = "AWS"
      identifiers = ["arn:aws:iam::123456789012:role/flat-lambda-principal"]
    }]

    instance_termination_watcher = {
      enable      = false
      memory_size = 999
      timeout     = 99
      s3_key      = "flat-termination-watcher.zip"
    }

    enable_ami_housekeeper                     = false
    ami_housekeeper_lambda_memory_size         = 999
    ami_housekeeper_lambda_timeout             = 99
    ami_housekeeper_lambda_s3_key              = "flat-ami-housekeeper.zip"
    ami_housekeeper_lambda_schedule_expression = "rate(1 hour)"

    experimental = {
      roles = {
        path = "/experimental/"
      }

      runner = {
        os            = "linux"
        architecture  = "x64"
        maximum_count = 2
        group_name    = "global-group"
      }

      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
        repository_white_list = ["nested-owner/nested-repository"]
        enterprise_server = {
          url        = "https://experimental-shared.example.com"
          ssl_verify = false
        }
        user_agent = "experimental-runner-user-agent"
      }

      webhook = {
        queue_selection_strategy = "all"
        eventbridge = {
          enable        = false
          accept_events = ["workflow_job"]
        }
        matcher_config_parameter_store_tier = "Advanced"
      }

      lambda = {
        artifact = {
          s3 = {
            bucket = "experimental-lambda-artifacts"
          }
        }
        scale = {
          artifact = {
            s3 = {
              key            = "nested-runners.zip"
              object_version = "nested-runners-version"
            }
          }
        }
        runtime = "nodejs22.x"
        principals = [{
          type        = "Service"
          identifiers = ["states.amazonaws.com"]
        }]
        scale_up = {
          memory_size = 768
          timeout     = 40
          event_source_mapping = {
            batch_size = 25
          }
        }
        scale_down = {
          timeout = 75
        }
        webhook = {
          artifact = {
            s3 = {
              key            = "nested-webhook.zip"
              object_version = "nested-webhook-version"
            }
          }
          api_gateway_access_log_settings = {
            destination_arn = "arn:aws:logs:eu-west-1:123456789012:log-group:nested-api-access"
            format          = "$context.requestId $context.status"
          }
          memory_size = 384
        }
        pool = {
          memory_size = 384
          config = [{
            schedule_expression = "cron(0 8 * * ? *)"
            size                = 1
          }]
        }
      }

      queue = {
        delay_webhook_event            = 23
        job_queue_retention_in_seconds = 172800
        visibility_timeout_seconds     = 240
        redrive_build_queue = {
          enabled         = true
          maxReceiveCount = 7
        }
        tags = {
          GlobalQueue = "global"
          Precedence  = "global"
        }
        encryption = {
          kms_data_key_reuse_period_seconds = 900
          kms_master_key_id                 = "arn:aws:kms:eu-west-1:123456789012:key/experimental-queue"
          sqs_managed_sse_enabled           = null
        }
      }

      ssm = {
        kms_key_id = "arn:aws:kms:eu-west-1:123456789012:key/experimental-queue"
      }

      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-experimental"
          subnet_ids = ["subnet-experimental"]
          ami = {
            housekeeper = {
              enabled = true
              cleanup_config = {
                maxItems       = 5
                minimumDaysOld = 10
                dryRun         = true
              }
              artifact = {
                s3 = {
                  key            = "nested-ami-housekeeper.zip"
                  object_version = "nested-ami-housekeeper-version"
                }
              }
              lambda = {
                memory_size = 448
                timeout     = 120
              }
              schedule = {
                expression = "rate(3 days)"
              }
            }
          }
          instance_termination_watcher = {
            enabled = true
            features = {
              enable_spot_termination_handler              = false
              enable_spot_termination_notification_watcher = true
            }
            enable_runner_deregistration = true
            environment_variables = {
              NESTED_WATCHER = "true"
            }
            artifact = {
              s3 = {
                key            = "nested-termination-watcher.zip"
                object_version = "nested-watcher-version"
              }
            }
            lambda = {
              memory_size = 432
              timeout     = 41
            }
          }
          runner_binaries = {
            enabled = false
            s3 = {
              tags = {
                BinaryBucket = "global"
              }
              versioning = "Enabled"
              logging = {
                bucket = "runner-binaries-access-logs"
                prefix = "runner-binaries/"
              }
            }
            syncer = {
              artifact = {
                s3 = {
                  key            = "nested-runner-binaries-syncer.zip"
                  object_version = "nested-version"
                }
              }
              lambda = {
                memory_size = 384
                timeout     = 240
              }
              schedule = {
                expression = "rate(2 hours)"
                state      = "DISABLED"
              }
            }
          }
        }
      }

      multi_runner_config = {
        resolved = {
          runner = {
            group_name    = "lane-group"
            maximum_count = 4
          }
          lambda = {
            role = {
              path = "/lane-lambda/"
            }
            scale_up = {
              memory_size = 896
              event_source_mapping = {
                batch_size = 50
              }
            }
            pool = {
              memory_size = 448
            }
          }
          job_retry = {
            enabled = true
          }
          queue = {
            delay_webhook_event        = 11
            visibility_timeout_seconds = 300
            tags = {
              LaneQueue  = "lane"
              Precedence = "lane"
            }
          }
          compute_provider = {
            ec2 = {
              instance_types = ["m5.large"]
              subnet_ids     = ["subnet-lane"]
              binaries_syncer = {
                enabled = true
              }
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64", "resolved"]]
          }
        }
      }
    }
  }

  assert {
    condition = (
      local.translated_experimental.multi_runner_config["resolved"].runner.os == "linux"
      && local.translated_experimental.multi_runner_config["resolved"].runner.architecture == "x64"
      && local.translated_experimental.multi_runner_config["resolved"].runner.maximum_count == 4
      && local.translated_experimental.multi_runner_config["resolved"].runner.group_name == "lane-group"
    )
    error_message = "Runner fields must resolve from experimental global defaults before applying lane overrides."
  }

  assert {
    condition = (
      local.translated_experimental.multi_runner_config["resolved"].compute_provider.ec2.vpc_id == "vpc-experimental"
      && local.translated_experimental.multi_runner_config["resolved"].compute_provider.ec2.subnet_ids == tolist(["subnet-lane"])
      && local.translated_experimental.multi_runner_config["resolved"].compute_provider.ec2.binaries_syncer.enabled
      && toset(keys(local.translated_experimental_base.multi_runner_config["resolved"].compute_provider.ec2.binaries_syncer)) == toset(["enabled"])
      && toset(keys(local.translated_experimental.multi_runner_config["resolved"].compute_provider.ec2.binaries_syncer)) == toset(["enabled", "s3"])
      && local.translated_experimental.multi_runner_config["resolved"].compute_provider.ec2.binaries_syncer.s3 != null
      && keys(output.binaries_syncer_map) == ["linux_x64"]
      && module.runner_stacks["resolved"].scale_up.lambda.environment[0].variables["INSTANCE_TYPES"] == "m5.large"
    )
    error_message = "Global compute-provider defaults must merge into the required lane selector while lane values take precedence."
  }

  assert {
    condition = (
      !local.translated_experimental.compute_provider.ec2.runner_binaries.enabled
      && local.translated_experimental.compute_provider.ec2.runner_binaries.s3.versioning == "Enabled"
      && local.translated_experimental.compute_provider.ec2.runner_binaries.s3.logging.bucket == "runner-binaries-access-logs"
      && local.translated_experimental.lambda.artifact.s3.bucket == "experimental-lambda-artifacts"
      && local.translated_experimental.compute_provider.ec2.runner_binaries.syncer.artifact.zip == null
      && local.translated_experimental.compute_provider.ec2.runner_binaries.syncer.artifact.s3.key == "nested-runner-binaries-syncer.zip"
      && local.translated_experimental.compute_provider.ec2.runner_binaries.syncer.artifact.s3.object_version == "nested-version"
      && local.translated_experimental.compute_provider.ec2.runner_binaries.syncer.schedule.expression == "rate(2 hours)"
      && local.translated_experimental.compute_provider.ec2.runner_binaries.syncer.schedule.state == "DISABLED"
      && keys(output.binaries_syncer_map) == ["linux_x64"]
      && output.binaries_syncer_map["linux_x64"].lambda.s3_bucket == "experimental-lambda-artifacts"
      && output.binaries_syncer_map["linux_x64"].lambda.s3_key == "nested-runner-binaries-syncer.zip"
      && output.binaries_syncer_map["linux_x64"].lambda.s3_object_version == "nested-version"
      && output.binaries_syncer_map["linux_x64"].lambda.memory_size == 384
      && output.binaries_syncer_map["linux_x64"].lambda.timeout == 240
      && output.binaries_syncer_map["linux_x64"].bucket.tags["BinaryBucket"] == "global"
    )
    error_message = "A lane must be able to enable the globally configured runner-binary distribution and syncer while the shared settings remain global."
  }

  assert {
    condition = (
      length(local.translated_experimental.multi_runner_config["resolved"].compute_provider.ec2.egress_rules) == 1
      && local.translated_experimental.multi_runner_config["resolved"].compute_provider.ec2.egress_rules[0].cidr_blocks == tolist(["0.0.0.0/0"])
      && local.translated_experimental.multi_runner_config["resolved"].compute_provider.ec2.egress_rules[0].ipv6_cidr_blocks == tolist(["::/0"])
      && local.translated_experimental.multi_runner_config["resolved"].compute_provider.ec2.egress_rules[0].prefix_list_ids == null
      && local.translated_experimental.multi_runner_config["resolved"].compute_provider.ec2.egress_rules[0].from_port == 0
      && local.translated_experimental.multi_runner_config["resolved"].compute_provider.ec2.egress_rules[0].protocol == "-1"
      && local.translated_experimental.multi_runner_config["resolved"].compute_provider.ec2.egress_rules[0].security_groups == null
      && local.translated_experimental.multi_runner_config["resolved"].compute_provider.ec2.egress_rules[0].self == null
      && local.translated_experimental.multi_runner_config["resolved"].compute_provider.ec2.egress_rules[0].to_port == 0
      && local.translated_experimental.multi_runner_config["resolved"].compute_provider.ec2.egress_rules[0].description == null
    )
    error_message = "Omitted experimental EC2 egress rules must resolve to the concrete nested allow-all IPv4 and IPv6 default independently of the stable input."
  }

  assert {
    condition = (
      module.runner_stacks["resolved"].scale_up.lambda.runtime == "nodejs22.x"
      && local.translated_experimental.lambda.scale.artifact.zip == null
      && local.translated_experimental.lambda.scale.artifact.s3.key == "nested-runners.zip"
      && local.translated_experimental.lambda.scale.artifact.s3.object_version == "nested-runners-version"
      && local.translated_experimental.lambda.artifact.s3.bucket == "experimental-lambda-artifacts"
      && local.translated_experimental.multi_runner_config["resolved"].lambda.zip == null
      && local.translated_experimental.multi_runner_config["resolved"].lambda.s3.bucket == "experimental-lambda-artifacts"
      && local.translated_experimental.multi_runner_config["resolved"].lambda.s3.key == "nested-runners.zip"
      && local.translated_experimental.multi_runner_config["resolved"].lambda.s3.object_version == "nested-runners-version"
      && local.translated_experimental.lambda.principals == tolist([{
        type        = "Service"
        identifiers = tolist(["states.amazonaws.com"])
      }])
      && module.runner_stacks["resolved"].scale_up.lambda.s3_bucket == "experimental-lambda-artifacts"
      && module.runner_stacks["resolved"].scale_up.lambda.s3_key == "nested-runners.zip"
      && module.runner_stacks["resolved"].scale_up.lambda.s3_object_version == "nested-runners-version"
      && module.runner_stacks["resolved"].scale_up.lambda.memory_size == 896
      && module.runner_stacks["resolved"].scale_up.lambda.timeout == 40
      && module.runner_stacks["resolved"].scale_down.lambda.timeout == 75
      && module.runner_stacks["resolved"].pool.lambda.memory_size == 448
      && local.translated_experimental.multi_runner_config["resolved"].lambda.scale_up.event_source_mapping.batch_size == 50
      && module.runner_stacks["resolved"].runner.role.path == "/experimental/"
      && module.runner_stacks["resolved"].scale_up.role.path == "/lane-lambda/"
    )
    error_message = "V2 values must resolve in lane-over-experimental-global precedence order without stable-input fallback."
  }

  assert {
    condition = (
      local.translated_experimental.multi_runner_config["resolved"].queue.delay_webhook_event == 11
      && local.translated_experimental.multi_runner_config["resolved"].queue.job_queue_retention_in_seconds == 172800
      && local.translated_experimental.multi_runner_config["resolved"].queue.visibility_timeout_seconds == 300
      && local.translated_experimental.multi_runner_config["resolved"].queue.redrive_build_queue.enabled
      && local.translated_experimental.multi_runner_config["resolved"].queue.redrive_build_queue.maxReceiveCount == 7
      && local.translated_experimental.multi_runner_config["resolved"].queue.tags == tomap({
        GlobalQueue = "global"
        LaneQueue   = "lane"
        Precedence  = "lane"
      })
      && local.translated_experimental.queue.encryption == var.experimental.queue.encryption
      && local.translated_experimental.ssm.kms_key_id == local.translated_experimental.queue.encryption.kms_master_key_id
      && aws_sqs_queue.queued_builds["resolved"].delay_seconds == 11
      && aws_sqs_queue.queued_builds["resolved"].message_retention_seconds == 172800
      && aws_sqs_queue.queued_builds["resolved"].visibility_timeout_seconds == 300
      && aws_sqs_queue.queued_builds["resolved"].kms_master_key_id == "arn:aws:kms:eu-west-1:123456789012:key/experimental-queue"
      && aws_sqs_queue.queued_builds["resolved"].kms_data_key_reuse_period_seconds == 900
      && aws_sqs_queue.queued_builds["resolved"].tags == tomap({
        GlobalQueue = "global"
        LaneQueue   = "lane"
        Precedence  = "lane"
      })
      && aws_sqs_queue.queued_builds_dlq["resolved"].kms_master_key_id == "arn:aws:kms:eu-west-1:123456789012:key/experimental-queue"
      && aws_sqs_queue.queued_builds_dlq["resolved"].tags == tomap({
        GlobalQueue = "global"
        LaneQueue   = "lane"
        Precedence  = "lane"
      })
    )
    error_message = "V2 queue leaves must resolve lane over experimental-global values, merge queue tags, and apply global nested encryption to the build queue and DLQ."
  }

  assert {
    condition = (
      local.translated_experimental.github.app == var.experimental.github.app
      && local.translated_experimental.github.additional_apps == var.experimental.github.additional_apps
      && local.translated_experimental.github.enterprise_server == var.experimental.github.enterprise_server
      && local.translated_experimental.github.user_agent == var.experimental.github.user_agent
      && local.translated_experimental.github.enterprise_server.url == "https://experimental-shared.example.com"
      && !local.translated_experimental.github.enterprise_server.ssl_verify
      && local.translated_experimental.github.user_agent == "experimental-runner-user-agent"
      && length(local.translated_experimental.github.additional_apps) == 0
      && local.translated_experimental.multi_runner_config["resolved"].job_retry.enabled
      && module.runner_stacks["resolved"].scale_up.lambda.environment[0].variables["GHES_URL"] == "https://experimental-shared.example.com"
      && module.runner_stacks["resolved"].scale_up.lambda.environment[0].variables["NODE_TLS_REJECT_UNAUTHORIZED"] == "0"
      && module.runner_stacks["resolved"].scale_up.lambda.environment[0].variables["USER_AGENT"] == "experimental-runner-user-agent"
      && module.runner_stacks["resolved"].scale_down.lambda.environment[0].variables["GHES_URL"] == "https://experimental-shared.example.com"
      && module.runner_stacks["resolved"].pool.lambda.environment[0].variables["USER_AGENT"] == "experimental-runner-user-agent"
      && module.runner_stacks["resolved"].scale_up.lambda.environment[0].variables["PARAMETER_GITHUB_APP_ID_NAME"] == module.ssm.parameters.github_app_id.name
      && local.translated_experimental.compute_provider.ec2.instance_termination_watcher.environment_variables["NESTED_WATCHER"] == "true"
      && output.instance_termination_watcher.lambda.function.runtime == "nodejs22.x"
      && output.instance_termination_watcher.lambda.function.architectures == tolist(["arm64"])
      && output.instance_termination_watcher.lambda.function.memory_size == 432
      && output.instance_termination_watcher.lambda.function.timeout == 41
      && output.instance_termination_watcher.lambda.function.s3_bucket == "experimental-lambda-artifacts"
      && output.instance_termination_watcher.lambda.function.s3_key == "nested-termination-watcher.zip"
      && output.instance_termination_watcher.lambda.function.s3_object_version == "nested-watcher-version"
      && length(output.instance_termination_watcher.lambda.function.vpc_config) == 1
      && length(output.instance_termination_watcher.lambda.function.vpc_config[0].subnet_ids) == 0
      && length(output.instance_termination_watcher.lambda.function.vpc_config[0].security_group_ids) == 0
      && output.instance_termination_watcher.lambda_role.path == "/experimental/"
      && output.instance_termination_watcher.lambda.function.environment[0].variables["GHES_URL"] == "https://experimental-shared.example.com"
      && output.instance_termination_watcher.lambda.function.environment[0].variables["LOG_LEVEL"] == "info"
      && output.instance_termination_watcher.lambda_log_group.retention_in_days == 180
      && output.instance_termination_watcher.lambda_log_group.log_group_class == "STANDARD"
      && output.instance_termination_handler == null
    )
    error_message = "V2 runner stacks and the termination watcher must use nested GitHub, Lambda, role, observability, feature, artifact, and sizing settings without flat component fallback."
  }

  assert {
    condition = (
      local.translated_experimental.compute_provider.ec2.ami.housekeeper.enabled
      && length(module.ami_housekeeper) == 1
      && module.ami_housekeeper[0].lambda.runtime == "nodejs22.x"
      && module.ami_housekeeper[0].lambda.architectures == tolist(["arm64"])
      && module.ami_housekeeper[0].lambda.memory_size == 448
      && module.ami_housekeeper[0].lambda.timeout == 120
      && module.ami_housekeeper[0].lambda.s3_bucket == "experimental-lambda-artifacts"
      && module.ami_housekeeper[0].lambda.s3_key == "nested-ami-housekeeper.zip"
      && module.ami_housekeeper[0].lambda.s3_object_version == "nested-ami-housekeeper-version"
      && jsondecode(module.ami_housekeeper[0].lambda.environment[0].variables["AMI_CLEANUP_OPTIONS"]).maxItems == 5
      && jsondecode(module.ami_housekeeper[0].lambda.environment[0].variables["AMI_CLEANUP_OPTIONS"]).minimumDaysOld == 10
      && jsondecode(module.ami_housekeeper[0].lambda.environment[0].variables["AMI_CLEANUP_OPTIONS"]).dryRun
      && module.ami_housekeeper[0].lambda_role.path == "/experimental/"
    )
    error_message = "The v2 AMI housekeeper must be owned by the nested EC2 global and inherit nested Lambda and role globals while ignoring all matching flat component inputs."
  }

  assert {
    condition = (
      local.translated_experimental.lambda.runtime == "nodejs22.x"
      && var.experimental.lambda.webhook.memory_size == 384
      && output.webhook.lambda.runtime == "nodejs22.x"
      && output.webhook.lambda.architectures == tolist(["arm64"])
      && output.webhook.lambda.memory_size == 384
      && output.webhook.lambda.timeout == 10
      && output.webhook.lambda.s3_bucket == "experimental-lambda-artifacts"
      && output.webhook.lambda.s3_key == "nested-webhook.zip"
      && output.webhook.lambda.s3_object_version == "nested-webhook-version"
      && output.webhook.lambda_role.path == "/experimental/"
      && toset(jsondecode(output.webhook.lambda.environment[0].variables["REPOSITORY_ALLOW_LIST"])) == toset(["nested-owner/nested-repository"])
      && output.webhook.lambda.environment[0].variables["QUEUE_SELECTION_STRATEGY"] == "all"
      && output.webhook.eventbridge == null
      && output.webhook.dispatcher == null
      && local.translated_experimental.webhook.matcher_config_parameter_store_tier == "Advanced"
      && local.translated_experimental.lambda.webhook.api_gateway_access_log_settings.destination_arn == "arn:aws:logs:eu-west-1:123456789012:log-group:nested-api-access"
      && local.translated_experimental.lambda.scale_up.event_source_mapping.batch_size == 25
      && local.translated_experimental.lambda.scale_up.event_source_mapping.maximum_batching_window_in_seconds == 0
      && !contains(keys(output.webhook.lambda.environment[0].variables), "GHES_URL")
    )
    error_message = "The shared webhook must consume nested GitHub, routing, eventbridge, matcher-tier, artifact, API-access-log, Lambda, and role globals without flat-input leakage."
  }
}

run "experimental_v2_layers_observability_and_ssm" {
  command = plan

  variables {
    tags = {
      ModuleOnly = "module"
      Precedence = "module"
    }

    log_level                 = "error"
    logging_retention_in_days = 90
    logging_kms_key_id        = "arn:aws:kms:eu-west-1:123456789012:key/flat-logs"
    log_class                 = "STANDARD"
    kms_key_arn               = "arn:aws:kms:eu-west-1:123456789012:key/global-ssm"
    ghes_url                  = "https://flat-observability.example.com"
    ghes_ssl_verify           = true
    user_agent                = "flat-observability-user-agent"

    tracing_config = {
      mode                  = null
      capture_http_requests = false
      capture_error         = false
    }

    metrics = {
      enable    = false
      namespace = "FlatMetrics"
      metric = {
        enable_github_app_rate_limit    = false
        enable_job_retry                = false
        enable_spot_termination_warning = false
      }
    }

    ssm_paths = {
      root    = "flat-root"
      app     = "shared-app"
      runners = "flat-runners"
      webhook = "shared-webhook"
    }

    parameter_store_tags = {
      FlatParameterOnly = "flat-parameter"
      Precedence        = "flat-parameter"
    }

    runners_ssm_housekeeper = {
      schedule_expression = "rate(1 day)"
      enabled             = true
      lambda_memory_size  = 512
      lambda_timeout      = 60
      config = {
        tokenPath      = "/flat/cleanup/tokens"
        minimumDaysOld = 1
        dryRun         = false
      }
    }

    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
        enterprise_server = {
          url        = "https://experimental-observability.example.com"
          ssl_verify = false
        }
        user_agent = "experimental-observability-user-agent"
      }

      lambda = {
        scale = {
          artifact = {
            zip = "README.md"
          }
        }
        webhook = {
          artifact = {
            zip = "README.md"
          }
        }
      }

      tags = {
        ExperimentalOnly = "experimental"
        Precedence       = "experimental"
      }

      runner = {
        os            = "linux"
        architecture  = "x64"
        maximum_count = 2
      }

      ssm = {
        paths = {
          root    = "/global-ssm"
          app     = "global-app"
          webhook = "global-webhook"
          tokens  = "global-tokens"
          config  = "global-config"
        }
        kms_key_id = "arn:aws:kms:eu-west-1:123456789012:key/global-ssm"
        tags = {
          GlobalSsmOnly = "global-ssm"
          Precedence    = "global-ssm"
        }
        parameters = {
          tags = {
            GlobalParameterOnly = "global-parameter"
            Precedence          = "global-parameter"
          }
        }
        housekeeper = {
          schedule_expression = "rate(6 hours)"
          state               = "DISABLED"
          tags = {
            GlobalHousekeeperOnly = "global-housekeeper"
            Precedence            = "global-housekeeper"
          }
          lambda = {
            memory_size = 640
            timeout     = 70
          }
          config = {
            tokenPath      = "/global/cleanup/tokens"
            minimumDaysOld = 6
            dryRun         = true
          }
        }
      }

      observability = {
        logs = {
          level             = "debug"
          retention_in_days = 30
          kms_key_id        = "arn:aws:kms:eu-west-1:123456789012:key/global-logs"
          class             = "INFREQUENT_ACCESS"
          tags = {
            GlobalLogOnly = "global-log"
            Precedence    = "global-log"
          }
        }
        tracing = {
          mode                  = "Active"
          capture_http_requests = true
          capture_error         = false
        }
        metrics = {
          enable    = true
          namespace = "GlobalMetrics"
          metric = {
            enable_github_app_rate_limit    = true
            enable_job_retry                = false
            enable_spot_termination_warning = false
          }
        }
      }

      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-global-observability"
          subnet_ids = ["subnet-global-observability"]
        }
      }

      multi_runner_config = {
        inherited = {
          tags = {
            InheritedOnly = "inherited"
            Precedence    = "inherited"
          }
          compute_provider = {
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = false
              }
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64", "inherited"]]
          }
        }

        overridden = {
          tags = {
            OverriddenOnly = "overridden"
            Precedence     = "overridden"
          }
          ssm = {
            paths = {
              root   = "/lane-ssm"
              tokens = "lane-tokens"
              config = "lane-config"
            }
            tags = {
              LaneSsmOnly = "lane-ssm"
              Precedence  = "lane-ssm"
            }
            parameters = {
              tags = {
                LaneParameterOnly = "lane-parameter"
                Precedence        = "lane-parameter"
              }
            }
            housekeeper = {
              schedule_expression = "rate(2 hours)"
              state               = "ENABLED"
              tags = {
                LaneHousekeeperOnly = "lane-housekeeper"
                Precedence          = "lane-housekeeper"
              }
              lambda = {
                memory_size = 768
                timeout     = 45
              }
              config = {
                tokenPath      = "/lane/cleanup/tokens"
                minimumDaysOld = 2
                dryRun         = false
              }
            }
          }
          observability = {
            logs = {
              level             = "warn"
              retention_in_days = 7
              kms_key_id        = "arn:aws:kms:eu-west-1:123456789012:key/lane-logs"
              class             = "STANDARD"
              tags = {
                LaneLogOnly = "lane-log"
                Precedence  = "lane-log"
              }
            }
            tracing = {
              mode                  = "PassThrough"
              capture_http_requests = false
              capture_error         = true
            }
            metrics = {
              enable    = false
              namespace = "LaneMetrics"
              metric = {
                enable_github_app_rate_limit = false
                enable_job_retry             = true
              }
            }
          }
          compute_provider = {
            ec2 = {
              instance_types = ["c5.large"]
              binaries_syncer = {
                enabled = false
              }
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64", "overridden"]]
          }
        }
      }
    }
  }

  assert {
    condition = (
      toset(keys(local.translated_experimental_base.multi_runner_config["inherited"].compute_provider.ec2.binaries_syncer)) == toset(["enabled"])
      && toset(keys(local.translated_experimental.multi_runner_config["inherited"].compute_provider.ec2.binaries_syncer)) == toset(["enabled", "s3"])
      && !local.translated_experimental.multi_runner_config["inherited"].compute_provider.ec2.binaries_syncer.enabled
      && local.translated_experimental.multi_runner_config["inherited"].compute_provider.ec2.binaries_syncer.s3 == null
      && !contains(keys(output.binaries_syncer_map), "linux_x64")
    )
    error_message = "A disabled binary syncer must gain a known null S3 value only in the final canonical lane and create no shared syncer resources."
  }

  assert {
    condition = (
      local.translated_experimental.multi_runner_config["inherited"].observability.logs.level == "debug"
      && local.translated_experimental.multi_runner_config["inherited"].observability.logs.retention_in_days == 30
      && local.translated_experimental.multi_runner_config["inherited"].observability.logs.kms_key_id == "arn:aws:kms:eu-west-1:123456789012:key/global-logs"
      && local.translated_experimental.multi_runner_config["inherited"].observability.logs.class == "INFREQUENT_ACCESS"
      && local.translated_experimental.multi_runner_config["inherited"].observability.tracing.mode == "Active"
      && local.translated_experimental.multi_runner_config["inherited"].observability.tracing.capture_http_requests
      && !local.translated_experimental.multi_runner_config["inherited"].observability.tracing.capture_error
      && local.translated_experimental.multi_runner_config["inherited"].observability.metrics.enable
      && local.translated_experimental.multi_runner_config["inherited"].observability.metrics.namespace == "GlobalMetrics"
      && local.translated_experimental.multi_runner_config["inherited"].observability.metrics.metric.enable_github_app_rate_limit
      && !local.translated_experimental.multi_runner_config["inherited"].observability.metrics.metric.enable_job_retry
      && local.translated_experimental.observability.metrics.metric.enable_spot_termination
      && !local.translated_experimental.observability.metrics.metric.enable_spot_termination_warning
    )
    error_message = "A lane omitting observability must inherit every runner-stack logging, tracing, and metrics leaf while watcher-only metric switches remain global."
  }

  assert {
    condition = (
      local.translated_experimental.multi_runner_config["overridden"].observability.logs.level == "warn"
      && local.translated_experimental.multi_runner_config["overridden"].observability.logs.retention_in_days == 7
      && local.translated_experimental.multi_runner_config["overridden"].observability.logs.kms_key_id == "arn:aws:kms:eu-west-1:123456789012:key/lane-logs"
      && local.translated_experimental.multi_runner_config["overridden"].observability.logs.class == "STANDARD"
      && local.translated_experimental.multi_runner_config["overridden"].observability.tracing.mode == "PassThrough"
      && !local.translated_experimental.multi_runner_config["overridden"].observability.tracing.capture_http_requests
      && local.translated_experimental.multi_runner_config["overridden"].observability.tracing.capture_error
      && !local.translated_experimental.multi_runner_config["overridden"].observability.metrics.enable
      && local.translated_experimental.multi_runner_config["overridden"].observability.metrics.namespace == "LaneMetrics"
      && !local.translated_experimental.multi_runner_config["overridden"].observability.metrics.metric.enable_github_app_rate_limit
      && local.translated_experimental.multi_runner_config["overridden"].observability.metrics.metric.enable_job_retry
    )
    error_message = "Lane observability values must override every lane-owned runner-stack logging, tracing, and metrics leaf."
  }

  assert {
    condition = (
      local.translated_experimental.multi_runner_config["inherited"].ssm.paths.root == "/global-ssm/inherited"
      && local.translated_experimental.multi_runner_config["inherited"].ssm.paths.tokens == "global-tokens"
      && local.translated_experimental.multi_runner_config["inherited"].ssm.paths.config == "global-config"
      && local.translated_experimental.ssm.kms_key_id == "arn:aws:kms:eu-west-1:123456789012:key/global-ssm"
      && local.translated_experimental.multi_runner_config["inherited"].ssm.housekeeper.schedule_expression == "rate(6 hours)"
      && local.translated_experimental.multi_runner_config["inherited"].ssm.housekeeper.state == "DISABLED"
      && local.translated_experimental.multi_runner_config["inherited"].ssm.housekeeper.lambda.memory_size == 640
      && local.translated_experimental.multi_runner_config["inherited"].ssm.housekeeper.lambda.timeout == 70
      && local.translated_experimental.multi_runner_config["inherited"].ssm.housekeeper.config.tokenPath == "/global/cleanup/tokens"
      && local.translated_experimental.multi_runner_config["inherited"].ssm.housekeeper.config.minimumDaysOld == 6
      && local.translated_experimental.multi_runner_config["inherited"].ssm.housekeeper.config.dryRun
    )
    error_message = "A lane omitting SSM values must inherit global paths, KMS ownership, and housekeeper settings."
  }

  assert {
    condition = (
      local.translated_experimental.multi_runner_config["overridden"].ssm.paths.root == "/lane-ssm/overridden"
      && local.translated_experimental.multi_runner_config["overridden"].ssm.paths.tokens == "lane-tokens"
      && local.translated_experimental.multi_runner_config["overridden"].ssm.paths.config == "lane-config"
      && local.translated_experimental.ssm.kms_key_id == "arn:aws:kms:eu-west-1:123456789012:key/global-ssm"
      && local.translated_experimental.multi_runner_config["overridden"].ssm.housekeeper.schedule_expression == "rate(2 hours)"
      && local.translated_experimental.multi_runner_config["overridden"].ssm.housekeeper.state == "ENABLED"
      && local.translated_experimental.multi_runner_config["overridden"].ssm.housekeeper.lambda.memory_size == 768
      && local.translated_experimental.multi_runner_config["overridden"].ssm.housekeeper.lambda.timeout == 45
      && local.translated_experimental.multi_runner_config["overridden"].ssm.housekeeper.config.tokenPath == "/lane/cleanup/tokens"
      && local.translated_experimental.multi_runner_config["overridden"].ssm.housekeeper.config.minimumDaysOld == 2
      && !local.translated_experimental.multi_runner_config["overridden"].ssm.housekeeper.config.dryRun
    )
    error_message = "Lane SSM paths and housekeeper leaves must override globals while the global KMS key ID remains shared by every lane."
  }

  assert {
    condition = (
      module.runner_stacks["inherited"].scale_up.lambda.environment[0].variables["LOG_LEVEL"] == "DEBUG"
      && module.runner_stacks["inherited"].scale_up.lambda.environment[0].variables["GHES_URL"] == "https://experimental-observability.example.com"
      && module.runner_stacks["inherited"].scale_up.lambda.environment[0].variables["NODE_TLS_REJECT_UNAUTHORIZED"] == "0"
      && module.runner_stacks["inherited"].scale_up.lambda.environment[0].variables["USER_AGENT"] == "experimental-observability-user-agent"
      && module.runner_stacks["inherited"].scale_up.lambda.environment[0].variables["POWERTOOLS_METRICS_NAMESPACE"] == "GlobalMetrics"
      && module.runner_stacks["inherited"].scale_up.lambda.environment[0].variables["ENABLE_METRIC_GITHUB_APP_RATE_LIMIT"] == "true"
      && module.runner_stacks["inherited"].scale_up.lambda.environment[0].variables["POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS"] == "true"
      && module.runner_stacks["inherited"].scale_up.lambda.environment[0].variables["POWERTOOLS_TRACER_CAPTURE_ERROR"] == "false"
      && module.runner_stacks["inherited"].scale_up.lambda.tracing_config[0].mode == "Active"
      && module.runner_stacks["inherited"].scale_up.log_group.retention_in_days == 30
      && module.runner_stacks["inherited"].scale_up.log_group.kms_key_id == "arn:aws:kms:eu-west-1:123456789012:key/global-logs"
      && module.runner_stacks["inherited"].scale_up.log_group.log_group_class == "INFREQUENT_ACCESS"
      && module.runner_stacks["overridden"].scale_up.lambda.environment[0].variables["LOG_LEVEL"] == "WARN"
      && module.runner_stacks["overridden"].scale_up.lambda.environment[0].variables["POWERTOOLS_METRICS_NAMESPACE"] == "LaneMetrics"
      && module.runner_stacks["overridden"].scale_up.lambda.environment[0].variables["ENABLE_METRIC_GITHUB_APP_RATE_LIMIT"] == "false"
      && module.runner_stacks["overridden"].scale_up.lambda.environment[0].variables["POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS"] == "false"
      && module.runner_stacks["overridden"].scale_up.lambda.environment[0].variables["POWERTOOLS_TRACER_CAPTURE_ERROR"] == "true"
      && module.runner_stacks["overridden"].scale_up.lambda.tracing_config[0].mode == "PassThrough"
      && module.runner_stacks["overridden"].scale_up.log_group.retention_in_days == 7
      && module.runner_stacks["overridden"].scale_up.log_group.kms_key_id == "arn:aws:kms:eu-west-1:123456789012:key/lane-logs"
      && module.runner_stacks["overridden"].scale_up.log_group.log_group_class == "STANDARD"
    )
    error_message = "Resolved global GitHub connection settings and global/lane observability must reach runner-stack Lambda and log-group resources."
  }

  assert {
    condition = (
      module.runner_stacks["inherited"].scale_up.lambda.environment[0].variables["SSM_TOKEN_PATH"] == "/global-ssm/inherited/global-tokens"
      && module.runner_stacks["inherited"].scale_up.lambda.environment[0].variables["SSM_CONFIG_PATH"] == "/global-ssm/inherited/global-config"
      && module.runner_stacks["overridden"].scale_up.lambda.environment[0].variables["SSM_TOKEN_PATH"] == "/lane-ssm/overridden/lane-tokens"
      && module.runner_stacks["overridden"].scale_up.lambda.environment[0].variables["SSM_CONFIG_PATH"] == "/lane-ssm/overridden/lane-config"
      && tomap({
        for tag in jsondecode(module.runner_stacks["inherited"].scale_up.lambda.environment[0].variables["SSM_PARAMETER_STORE_TAGS"]) :
        tag.Key => tag.Value
        }) == tomap({
        ExperimentalOnly    = "experimental"
        InheritedOnly       = "inherited"
        GlobalSsmOnly       = "global-ssm"
        GlobalParameterOnly = "global-parameter"
        Precedence          = "global-parameter"
        "ghr:environment"   = "github-actions"
      })
      && tomap({
        for tag in jsondecode(module.runner_stacks["overridden"].scale_up.lambda.environment[0].variables["SSM_PARAMETER_STORE_TAGS"]) :
        tag.Key => tag.Value
        }) == tomap({
        ExperimentalOnly    = "experimental"
        OverriddenOnly      = "overridden"
        GlobalSsmOnly       = "global-ssm"
        LaneSsmOnly         = "lane-ssm"
        GlobalParameterOnly = "global-parameter"
        LaneParameterOnly   = "lane-parameter"
        Precedence          = "lane-parameter"
        "ghr:environment"   = "github-actions"
      })
    )
    error_message = "Resolved lane roots and layered SSM parameter tags must reach runner-stack runtime configuration."
  }

  assert {
    condition = (
      local.translated_experimental.multi_runner_config["inherited"].ssm.housekeeper.tags == tomap({
        GlobalHousekeeperOnly = "global-housekeeper"
        Precedence            = "global-housekeeper"
      })
      && local.translated_experimental.multi_runner_config["overridden"].ssm.housekeeper.tags == tomap({
        GlobalHousekeeperOnly = "global-housekeeper"
        LaneHousekeeperOnly   = "lane-housekeeper"
        Precedence            = "lane-housekeeper"
      })
      && module.runner_stacks["inherited"].scale_up.log_group.tags == tomap({
        ExperimentalOnly  = "experimental"
        InheritedOnly     = "inherited"
        GlobalLogOnly     = "global-log"
        Precedence        = "global-log"
        "ghr:environment" = "github-actions"
      })
      && module.runner_stacks["overridden"].scale_up.log_group.tags == tomap({
        ExperimentalOnly  = "experimental"
        OverriddenOnly    = "overridden"
        GlobalLogOnly     = "global-log"
        LaneLogOnly       = "lane-log"
        Precedence        = "lane-log"
        "ghr:environment" = "github-actions"
      })
    )
    error_message = "Global and lane observability and SSM housekeeper tags must merge with narrower scopes taking precedence."
  }

  assert {
    condition = (
      var.ssm_paths.root == "flat-root"
      && local.translated_experimental.ssm.kms_key_id == "arn:aws:kms:eu-west-1:123456789012:key/global-ssm"
      && var.kms_key_arn == local.translated_experimental.ssm.kms_key_id
      && output.webhook.lambda.runtime == "nodejs24.x"
      && output.webhook.lambda.architectures == tolist(["arm64"])
      && output.webhook.lambda.environment[0].variables["PARAMETER_RUNNER_MATCHER_CONFIG_PATH"] == "/global-ssm/global-webhook/runner-matcher-config"
      && output.webhook.lambda.environment[0].variables["LOG_LEVEL"] == "DEBUG"
      && output.webhook.lambda.environment[0].variables["POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS"] == "true"
      && output.webhook.lambda.environment[0].variables["POWERTOOLS_TRACER_CAPTURE_ERROR"] == "false"
      && output.webhook.lambda.tracing_config[0].mode == "Active"
      && output.webhook.lambda_log_group.retention_in_days == 30
      && output.webhook.lambda_log_group.kms_key_id == "arn:aws:kms:eu-west-1:123456789012:key/global-logs"
      && output.webhook.lambda_log_group.log_group_class == "INFREQUENT_ACCESS"
      && output.webhook.lambda.tags["ExperimentalOnly"] == "experimental"
      && !contains(keys(output.webhook.lambda.tags), "ModuleOnly")
    )
    error_message = "The shared webhook must use translated global SSM/KMS, observability, Lambda, and tag inputs rather than flat compatibility values."
  }

  assert {
    condition     = output.ssm_parameters.id.name == "/global-ssm/global-app/github_app_id"
    error_message = "Shared SSM parameters must use translated global root and app paths in v2 mode."
  }
}

run "experimental_v2_requires_global_github_app" {
  command = plan

  plan_options {
    target = [terraform_data.validate_experimental]
  }

  override_module {
    target = module.ssm
    outputs = {
      parameters = {
        github_app_id             = { name = "/mock/app-id", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/mock/app-id" }
        github_app_key_base64     = { name = "/mock/key", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/mock/key" }
        github_app_webhook_secret = { name = "/mock/webhook-secret", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/mock/webhook-secret" }
      }
      additional_app_parameters = []
    }
  }

  variables {
    experimental = {
      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-missing-github-app"
          subnet_ids = ["subnet-missing-github-app"]
        }
      }
      multi_runner_config = {
        missing_github_app = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
          }
          compute_provider = {
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = false
              }
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64", "missing-github-app"]]
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_experimental]
}

run "experimental_v2_rejects_incomplete_global_github_app" {
  command = plan

  plan_options {
    target = [terraform_data.validate_experimental]
  }

  override_module {
    target = module.ssm
    outputs = {
      parameters = {
        github_app_id             = { name = "/mock/app-id", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/mock/app-id" }
        github_app_key_base64     = { name = "/mock/key", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/mock/key" }
        github_app_webhook_secret = { name = "/mock/webhook-secret", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/mock/webhook-secret" }
      }
      additional_app_parameters = []
    }
  }

  variables {
    experimental = {
      github = {
        app = {
          id         = "123456"
          key_base64 = "dGVzdA=="
        }
      }
      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-incomplete-github-app"
          subnet_ids = ["subnet-incomplete-github-app"]
        }
      }
      multi_runner_config = {
        incomplete_github_app = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
          }
          compute_provider = {
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = false
              }
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64", "incomplete-github-app"]]
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_experimental]
}

run "experimental_v2_rejects_incomplete_additional_github_app" {
  command = plan

  plan_options {
    target = [terraform_data.validate_experimental]
  }

  override_module {
    target = module.ssm
    outputs = {
      parameters = {
        github_app_id             = { name = "/mock/app-id", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/mock/app-id" }
        github_app_key_base64     = { name = "/mock/key", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/mock/key" }
        github_app_webhook_secret = { name = "/mock/webhook-secret", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/mock/webhook-secret" }
      }
      additional_app_parameters = []
    }
  }

  variables {
    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
        additional_apps = [{
          id = "incomplete-additional-app"
        }]
      }
      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-incomplete-additional-app"
          subnet_ids = ["subnet-incomplete-additional-app"]
        }
      }
      multi_runner_config = {
        incomplete_additional_app = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
          }
          compute_provider = {
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = false
              }
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64", "incomplete-additional-app"]]
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_experimental]
}

run "experimental_v2_prefers_nested_primary_github_app_over_flat" {
  command = plan

  variables {
    experimental = {
      github = {
        app = {
          id             = "different-app-id"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
      }
      lambda = {
        scale = {
          artifact = {
            zip = "README.md"
          }
        }
        webhook = {
          artifact = {
            zip = "README.md"
          }
        }
      }
      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-mismatched-primary-app"
          subnet_ids = ["subnet-mismatched-primary-app"]
        }
      }
      multi_runner_config = {
        mismatched_primary_app = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
          }
          compute_provider = {
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = false
              }
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64", "mismatched-primary-app"]]
          }
        }
      }
    }
  }

  assert {
    condition = (
      var.github_app.id == "123456"
      && local.translated_experimental.github.app.id == "different-app-id"
      && length(local.github_app_parameters.id) == 1
      && output.ssm_parameters.id.name == "/github-action-runners/github-actions/app/github_app_id"
    )
    error_message = "V2 must use the nested primary GitHub App and generated parameter references even when the stable flat app differs."
  }
}

run "experimental_v2_prefers_nested_additional_github_apps_over_flat" {
  command = plan

  variables {
    additional_github_apps = [{
      id_ssm = {
        name = "/github-runner/flat-additional-app-id"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/flat-additional-app-id"
      }
      key_base64_ssm = {
        name = "/github-runner/flat-additional-key-base64"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/flat-additional-key-base64"
      }
    }]

    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
      }
      lambda = {
        scale = {
          artifact = {
            zip = "README.md"
          }
        }
        webhook = {
          artifact = {
            zip = "README.md"
          }
        }
      }
      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-mismatched-additional-apps"
          subnet_ids = ["subnet-mismatched-additional-apps"]
        }
      }
      multi_runner_config = {
        mismatched_additional_apps = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
          }
          compute_provider = {
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = false
              }
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64", "mismatched-additional-apps"]]
          }
        }
      }
    }
  }

  assert {
    condition = (
      length(var.additional_github_apps) == 1
      && length(local.translated_experimental.github.additional_apps) == 0
      && length(local.github_app_parameters.id) == 1
      && !contains(keys(output.ssm_parameters), "github_app_id_1")
    )
    error_message = "V2 must ignore stable flat additional GitHub Apps when the nested additional-app list is empty."
  }
}

run "experimental_v2_allows_mismatched_watcher_ghes_when_deregistration_disabled" {
  command = plan

  variables {
    ghes_url = "https://flat-disabled-deregistration.example.com"
    instance_termination_watcher = {
      enable                       = false
      enable_runner_deregistration = true
    }

    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
        enterprise_server = {
          url = "https://experimental-disabled-deregistration.example.com"
        }
      }
      lambda = {
        scale = {
          artifact = {
            zip = "README.md"
          }
        }
        webhook = {
          artifact = {
            zip = "README.md"
          }
        }
      }
      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-disabled-deregistration"
          subnet_ids = ["subnet-disabled-deregistration"]
          instance_termination_watcher = {
            enabled                      = true
            enable_runner_deregistration = false
            artifact = {
              zip = "README.md"
            }
          }
        }
      }
      multi_runner_config = {
        disabled_deregistration = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
          }
          compute_provider = {
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = false
              }
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64", "disabled-deregistration"]]
          }
        }
      }
    }
  }

  assert {
    condition = (
      !var.instance_termination_watcher.enable
      && local.translated_experimental.compute_provider.ec2.instance_termination_watcher.enabled
      && !local.translated_experimental.compute_provider.ec2.instance_termination_watcher.enable_runner_deregistration
      && output.instance_termination_watcher != null
      && module.runner_stacks["disabled_deregistration"].scale_up.lambda.environment[0].variables["GHES_URL"] == "https://experimental-disabled-deregistration.example.com"
    )
    error_message = "The termination watcher must remain enabled while the v2 runner stack uses the translated enterprise-server URL when deregistration is disabled."
  }
}

run "experimental_v2_termination_watcher_ignores_mismatched_flat_ghes_url" {
  command = plan

  variables {
    ghes_url = "https://flat-watcher.example.com"
    instance_termination_watcher = {
      enable                       = false
      enable_runner_deregistration = false
    }

    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
        enterprise_server = {
          url = "https://experimental-watcher.example.com"
        }
      }
      lambda = {
        scale = {
          artifact = {
            zip = "README.md"
          }
        }
        webhook = {
          artifact = {
            zip = "README.md"
          }
        }
      }
      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-mismatched-watcher-ghes"
          subnet_ids = ["subnet-mismatched-watcher-ghes"]
          instance_termination_watcher = {
            enabled                      = true
            enable_runner_deregistration = true
            artifact = {
              zip = "README.md"
            }
          }
        }
      }
      multi_runner_config = {
        mismatched_watcher_ghes = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
          }
          compute_provider = {
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = false
              }
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64", "mismatched-watcher-ghes"]]
          }
        }
      }
    }
  }

  assert {
    condition = (
      !var.instance_termination_watcher.enable
      && local.translated_experimental.compute_provider.ec2.instance_termination_watcher.enabled
      && local.translated_experimental.compute_provider.ec2.instance_termination_watcher.enable_runner_deregistration
      && output.instance_termination_watcher.lambda.function.environment[0].variables["GHES_URL"] == "https://experimental-watcher.example.com"
      && module.runner_stacks["mismatched_watcher_ghes"].scale_up.lambda.environment[0].variables["GHES_URL"] == "https://experimental-watcher.example.com"
      && var.ghes_url == "https://flat-watcher.example.com"
    )
    error_message = "An enabled v2 termination watcher must use the translated enterprise-server URL instead of a deliberately different flat GHES URL."
  }
}

run "experimental_v2_ignores_flat_only_shared_ssm_kms_key" {
  command = plan

  variables {
    kms_key_arn = "arn:aws:kms:eu-west-1:123456789012:key/flat-only"

    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
      }
      lambda = {
        scale = {
          artifact = {
            zip = "README.md"
          }
        }
        webhook = {
          artifact = {
            zip = "README.md"
          }
        }
      }
      runner = {
        os            = "linux"
        architecture  = "x64"
        maximum_count = 2
      }
      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-flat-only-kms"
          subnet_ids = ["subnet-flat-only-kms"]
        }
      }
      multi_runner_config = {
        flat_only = {
          compute_provider = {
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = false
              }
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64", "flat-only-kms"]]
          }
        }
      }
    }
  }

  assert {
    condition = (
      var.kms_key_arn == "arn:aws:kms:eu-west-1:123456789012:key/flat-only"
      && local.translated_experimental.ssm.kms_key_id == null
      && output.ssm_parameters.id.name == "/github-action-runners/github-actions/app/github_app_id"
    )
    error_message = "V2 shared SSM resources must ignore a flat-only KMS key when the nested KMS key ID is absent."
  }
}

run "experimental_v2_uses_experimental_only_shared_ssm_kms_key" {
  command = plan

  variables {
    kms_key_arn = null

    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
      }
      lambda = {
        scale = {
          artifact = {
            zip = "README.md"
          }
        }
        webhook = {
          artifact = {
            zip = "README.md"
          }
        }
      }
      runner = {
        os            = "linux"
        architecture  = "x64"
        maximum_count = 2
      }
      ssm = {
        kms_key_id = "arn:aws:kms:eu-west-1:123456789012:key/experimental-only"
      }
      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-experimental-only-kms"
          subnet_ids = ["subnet-experimental-only-kms"]
        }
      }
      multi_runner_config = {
        experimental_only = {
          compute_provider = {
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = false
              }
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64", "experimental-only-kms"]]
          }
        }
      }
    }
  }

  assert {
    condition = (
      var.kms_key_arn == null
      && local.translated_experimental.ssm.kms_key_id == "arn:aws:kms:eu-west-1:123456789012:key/experimental-only"
      && output.ssm_parameters.id.name == "/github-action-runners/github-actions/app/github_app_id"
    )
    error_message = "V2 shared SSM resources must accept a nested KMS key ID without a flat KMS key."
  }
}

run "experimental_v2_prefers_nested_shared_ssm_kms_key_over_flat" {
  command = plan

  variables {
    kms_key_arn = "arn:aws:kms:eu-west-1:123456789012:key/flat-mismatch"

    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
      }
      lambda = {
        scale = {
          artifact = {
            zip = "README.md"
          }
        }
        webhook = {
          artifact = {
            zip = "README.md"
          }
        }
      }
      runner = {
        os            = "linux"
        architecture  = "x64"
        maximum_count = 2
      }
      ssm = {
        kms_key_id = "arn:aws:kms:eu-west-1:123456789012:key/experimental-mismatch"
      }
      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-mismatched-kms"
          subnet_ids = ["subnet-mismatched-kms"]
        }
      }
      multi_runner_config = {
        mismatched = {
          compute_provider = {
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = false
              }
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64", "mismatched-kms"]]
          }
        }
      }
    }
  }

  assert {
    condition = (
      var.kms_key_arn == "arn:aws:kms:eu-west-1:123456789012:key/flat-mismatch"
      && local.translated_experimental.ssm.kms_key_id == "arn:aws:kms:eu-west-1:123456789012:key/experimental-mismatch"
    )
    error_message = "V2 shared SSM resources must prefer the nested KMS key ID over a deliberately different flat KMS key."
  }
}

run "experimental_v2_external_role_ignores_global_iam_management" {
  command = plan

  variables {
    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
      }
      lambda = {
        scale = {
          artifact = {
            zip = "README.md"
          }
        }
        webhook = {
          artifact = {
            zip = "README.md"
          }
        }
      }
      runner = {
        iam = {
          managed_policy_arns = {
            readonly = "arn:aws:iam::aws:policy/ReadOnlyAccess"
          }
          additional_trust_policy_json = jsonencode({
            Version   = "2012-10-17"
            Statement = []
          })
        }
      }

      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-external-role"
          subnet_ids = ["subnet-external-role"]
        }
      }

      multi_runner_config = {
        external = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
            iam = {
              role = {
                arn = "arn:aws:iam::123456789012:role/external-runner"
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
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64", "external"]]
          }
        }
      }
    }
  }

  assert {
    condition = (
      local.translated_experimental.multi_runner_config["external"].runner.iam.role.arn == "arn:aws:iam::123456789012:role/external-runner"
      && length(local.translated_experimental.multi_runner_config["external"].runner.iam.managed_policy_arns) == 0
      && local.translated_experimental.multi_runner_config["external"].runner.iam.additional_trust_policy_json == null
    )
    error_message = "A lane selecting an external runner role must not inherit global managed policies or trust-policy additions."
  }
}

run "experimental_v2_rejects_explicit_iam_management_with_external_role" {
  command = plan

  plan_options {
    target = [terraform_data.validate_experimental]
  }

  override_module {
    target = module.runner_stacks["invalid"]
  }

  variables {
    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
      }
      runner = {
        iam = {
          managed_policy_arns = {
            readonly = "arn:aws:iam::aws:policy/ReadOnlyAccess"
          }
        }
      }

      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-invalid-external-role"
          subnet_ids = ["subnet-invalid-external-role"]
        }
      }

      multi_runner_config = {
        invalid = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
            iam = {
              role = {
                arn = "arn:aws:iam::123456789012:role/external-runner"
              }
              managed_policy_arns = {
                explicit = "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"
              }
              additional_trust_policy_json = jsonencode({
                Version   = "2012-10-17"
                Statement = []
              })
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
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64", "invalid"]]
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_experimental]
}

run "experimental_v2_layers_shared_and_component_tags" {
  command = plan

  variables {
    tags = {
      GlobalOnly = "global"
      Precedence = "global"
    }

    lambda_tags = {
      SharedLambdaOnly = "shared-lambda"
      Precedence       = "shared-lambda"
    }

    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
      }

      tags = {
        ExperimentalOnly = "experimental"
        Precedence       = "experimental"
      }

      lambda = {
        scale = {
          artifact = {
            zip = "README.md"
          }
        }
        tags = {
          ExperimentalLambdaOnly = "experimental-lambda"
          Precedence             = "experimental-lambda"
        }
        webhook = {
          artifact = {
            zip = "README.md"
          }
        }
      }

      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-tagged"
          subnet_ids = ["subnet-tagged"]
        }
      }

      multi_runner_config = {
        tagged = {
          tags = {
            RunnerConfigOnly = "runner-config"
            Precedence       = "runner-config"
          }

          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
            tags = {
              RunnerOnly = "runner"
              Precedence = "runner"
            }
          }

          lambda = {
            tags = {
              ConfigLambdaOnly = "config-lambda"
              Precedence       = "config-lambda"
            }
            scale_up = {
              tags = {
                ScaleUpOnly = "scale-up"
                Precedence  = "scale-up"
              }
            }
            scale_down = {
              tags = {
                ScaleDownOnly = "scale-down"
                Precedence    = "scale-down"
              }
            }
          }

          queue = {
            redrive_build_queue = {
              enabled         = true
              maxReceiveCount = 3
            }
            tags = {
              SharedQueueOnly = "shared-queue"
              Precedence      = "shared-queue"
            }
          }

          observability = {
            logs = {
              tags = {
                SharedLogOnly = "shared-log"
                Precedence    = "shared-log"
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

          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64", "tagged"]]
          }
        }
      }
    }
  }

  assert {
    condition = aws_sqs_queue.queued_builds["tagged"].tags == tomap({
      ExperimentalOnly = "experimental"
      RunnerConfigOnly = "runner-config"
      SharedQueueOnly  = "shared-queue"
      Precedence       = "shared-queue"
    })
    error_message = "Experimental v2 build queue tags must merge global, runner-configuration, and queue tags in that precedence order."
  }

  assert {
    condition = aws_sqs_queue.queued_builds_dlq["tagged"].tags == tomap({
      ExperimentalOnly = "experimental"
      RunnerConfigOnly = "runner-config"
      SharedQueueOnly  = "shared-queue"
      Precedence       = "shared-queue"
    })
    error_message = "Experimental v2 dead-letter queue tags must use the same layered precedence as the build queue."
  }

  assert {
    condition = module.runner_stacks["tagged"].scale_up.lambda.tags == tomap({
      ExperimentalOnly       = "experimental"
      RunnerConfigOnly       = "runner-config"
      ExperimentalLambdaOnly = "experimental-lambda"
      ConfigLambdaOnly       = "config-lambda"
      ScaleUpOnly            = "scale-up"
      Precedence             = "scale-up"
      "ghr:environment"      = "github-actions"
    })
    error_message = "Scale-up Lambda tags must merge global, runner-configuration, shared Lambda, configuration Lambda, and component tags in that precedence order."
  }

  assert {
    condition = module.runner_stacks["tagged"].scale_up.log_group.tags == tomap({
      ExperimentalOnly  = "experimental"
      RunnerConfigOnly  = "runner-config"
      SharedLogOnly     = "shared-log"
      ScaleUpOnly       = "scale-up"
      Precedence        = "scale-up"
      "ghr:environment" = "github-actions"
    })
    error_message = "Scale-up log-group tags must merge global, runner-configuration, shared log, and component tags in that precedence order."
  }

  assert {
    condition = module.runner_stacks["tagged"].scale_up.role.tags == tomap({
      ExperimentalOnly  = "experimental"
      RunnerConfigOnly  = "runner-config"
      ScaleUpOnly       = "scale-up"
      Precedence        = "scale-up"
      "ghr:environment" = "github-actions"
    })
    error_message = "Scale-up role tags must merge global, runner-configuration, and component tags without Lambda- or log-only tags."
  }

  assert {
    condition = module.runner_stacks["tagged"].runner.role.tags == tomap({
      ExperimentalOnly  = "experimental"
      RunnerConfigOnly  = "runner-config"
      RunnerOnly        = "runner"
      Precedence        = "runner"
      "ghr:environment" = "github-actions"
    })
    error_message = "Runner role tags must merge global, runner-configuration, and runner-component tags in that precedence order."
  }

  assert {
    condition = module.runner_stacks["tagged"].scale_down.lambda.tags == tomap({
      ExperimentalOnly       = "experimental"
      RunnerConfigOnly       = "runner-config"
      ExperimentalLambdaOnly = "experimental-lambda"
      ConfigLambdaOnly       = "config-lambda"
      ScaleDownOnly          = "scale-down"
      Precedence             = "scale-down"
      "ghr:environment"      = "github-actions"
    })
    error_message = "Scale-down Lambda tags must preserve shared layers before applying scale-down component tags."
  }

  assert {
    condition = module.runner_stacks["tagged"].scale_down.log_group.tags == tomap({
      ExperimentalOnly  = "experimental"
      RunnerConfigOnly  = "runner-config"
      SharedLogOnly     = "shared-log"
      ScaleDownOnly     = "scale-down"
      Precedence        = "scale-down"
      "ghr:environment" = "github-actions"
    })
    error_message = "Scale-down log-group tags must preserve shared log tags before applying scale-down component tags."
  }

  assert {
    condition     = output.runners_map_v2["tagged"].pool == null
    error_message = "Experimental v2 must expose a null pool object when no pool configuration is supplied."
  }
}

run "experimental_v2_rejects_visibility_timeout_shorter_than_lambda_retry_window" {
  command = plan

  plan_options {
    target = [terraform_data.validate_experimental]
  }

  variables {
    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
      }
      lambda = {
        scale_up = {
          timeout = 40
        }
      }
      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-invalid-visibility"
          subnet_ids = ["subnet-invalid-visibility"]
        }
      }

      multi_runner_config = {
        invalid_visibility = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
          }
          queue = {
            visibility_timeout_seconds = 239
          }
          compute_provider = {
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = false
              }
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64"]]
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_experimental]
}

run "experimental_v2_rejects_conflicting_queue_encryption" {
  command = plan

  plan_options {
    target = [terraform_data.validate_experimental]
  }

  variables {
    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
      }
      queue = {
        encryption = {
          kms_data_key_reuse_period_seconds = null
          kms_master_key_id                 = "arn:aws:kms:eu-west-1:123456789012:key/conflicting-queue"
          sqs_managed_sse_enabled           = true
        }
      }
      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-invalid-encryption"
          subnet_ids = ["subnet-invalid-encryption"]
        }
      }

      multi_runner_config = {
        invalid_encryption = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
          }
          compute_provider = {
            ec2 = {
              instance_types = ["m5.large"]
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64"]]
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_experimental]
}

run "experimental_v2_rejects_redrive_without_max_receive_count" {
  command = plan

  plan_options {
    target = [terraform_data.validate_experimental]
  }

  variables {
    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
      }
      queue = {
        redrive_build_queue = {
          enabled = true
        }
      }
      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-missing-redrive-max"
          subnet_ids = ["subnet-missing-redrive-max"]
        }
      }
      multi_runner_config = {
        missing_redrive_max = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
          }
          compute_provider = {
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = false
              }
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64"]]
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_experimental]
}

run "experimental_v2_rejects_nonpositive_redrive_max_receive_count" {
  command = plan

  plan_options {
    target = [terraform_data.validate_experimental]
  }

  variables {
    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
      }
      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-nonpositive-redrive-max"
          subnet_ids = ["subnet-nonpositive-redrive-max"]
        }
      }
      multi_runner_config = {
        nonpositive_redrive_max = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
          }
          queue = {
            redrive_build_queue = {
              enabled         = true
              maxReceiveCount = 0
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
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64"]]
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_experimental]
}

run "experimental_v2_rejects_runner_artifact_zip_and_s3" {
  command = plan

  plan_options {
    target = [terraform_data.validate_experimental]
  }

  variables {
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
            bucket = "lambda-artifacts"
          }
        }
        scale = {
          artifact = {
            zip = "README.md"
            s3 = {
              key = "runners.zip"
            }
          }
        }
      }
      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-conflicting-runner-artifact"
          subnet_ids = ["subnet-conflicting-runner-artifact"]
        }
      }
      multi_runner_config = {
        conflicting_runner_artifact = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
          }
          compute_provider = {
            ec2 = {
              instance_types = ["m5.large"]
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64"]]
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_experimental]
}

run "experimental_v2_rejects_runner_artifact_bucket_without_key" {
  command = plan

  plan_options {
    target = [terraform_data.validate_experimental]
  }

  variables {
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
            bucket = "lambda-artifacts"
          }
        }
        scale = {
          artifact = {
            s3 = {
              key = null
            }
          }
        }
      }
      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-missing-runner-artifact-key"
          subnet_ids = ["subnet-missing-runner-artifact-key"]
        }
      }
      multi_runner_config = {
        missing_runner_artifact_key = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
          }
          compute_provider = {
            ec2 = {
              instance_types = ["m5.large"]
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64"]]
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_experimental]
}

run "experimental_v2_rejects_runner_artifact_s3_without_bucket" {
  command = plan

  plan_options {
    target = [terraform_data.validate_experimental]
  }

  variables {
    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
      }
      lambda = {
        scale = {
          artifact = {
            s3 = {
              key = "runners.zip"
            }
          }
        }
      }
      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-missing-runner-artifact-bucket"
          subnet_ids = ["subnet-missing-runner-artifact-bucket"]
        }
      }
      multi_runner_config = {
        missing_runner_artifact_bucket = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
          }
          compute_provider = {
            ec2 = {
              instance_types = ["m5.large"]
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64"]]
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_experimental]
}

run "experimental_v2_rejects_runner_binaries_artifact_zip_and_s3" {
  command = plan

  plan_options {
    target = [terraform_data.validate_experimental]
  }

  variables {
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
            bucket = "lambda-artifacts"
          }
        }
      }
      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-conflicting-binary-artifact"
          subnet_ids = ["subnet-conflicting-binary-artifact"]
          runner_binaries = {
            syncer = {
              artifact = {
                zip = "runner-binaries-syncer.zip"
                s3 = {
                  key = "runner-binaries-syncer.zip"
                }
              }
            }
          }
        }
      }
      multi_runner_config = {
        conflicting_binary_artifact = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
          }
          compute_provider = {
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = false
              }
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64"]]
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_experimental]
}

run "experimental_v2_rejects_runner_binaries_logging_prefix_without_bucket" {
  command = plan

  plan_options {
    target = [terraform_data.validate_experimental]
  }

  variables {
    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
      }
      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-binary-logging-prefix"
          subnet_ids = ["subnet-binary-logging-prefix"]
          runner_binaries = {
            s3 = {
              logging = {
                prefix = "runner-binaries/"
              }
            }
          }
        }
      }
      multi_runner_config = {
        binary_logging_prefix = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
          }
          compute_provider = {
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = false
              }
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64"]]
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_experimental]
}

run "experimental_v2_accepts_distinct_queue_and_ssm_kms_keys" {
  command = plan

  variables {
    kms_key_arn = "arn:aws:kms:eu-west-1:123456789012:key/shared-control-plane"

    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
      }
      lambda = {
        scale = {
          artifact = {
            zip = "README.md"
          }
        }
        webhook = {
          artifact = {
            zip = "README.md"
          }
        }
      }
      queue = {
        encryption = {
          kms_data_key_reuse_period_seconds = 300
          kms_master_key_id                 = "arn:aws:kms:eu-west-1:123456789012:key/queue-only"
          sqs_managed_sse_enabled           = null
        }
      }
      ssm = {
        kms_key_id = "arn:aws:kms:eu-west-1:123456789012:key/shared-control-plane"
      }
      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-mismatched-queue-kms"
          subnet_ids = ["subnet-mismatched-queue-kms"]
        }
      }

      multi_runner_config = {
        mismatched_queue_kms = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
          }
          compute_provider = {
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = false
              }
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64"]]
          }
        }
      }
    }
  }

  assert {
    condition = (
      local.translated_experimental.queue.encryption.kms_master_key_id == "arn:aws:kms:eu-west-1:123456789012:key/queue-only"
      && local.translated_experimental.ssm.kms_key_id == "arn:aws:kms:eu-west-1:123456789012:key/shared-control-plane"
      && aws_sqs_queue.queued_builds["mismatched_queue_kms"].kms_master_key_id == "arn:aws:kms:eu-west-1:123456789012:key/queue-only"
    )
    error_message = "V2 queue and shared SSM resources must accept and independently use distinct customer-managed KMS keys."
  }
}

run "experimental_v2_rejects_empty_compute_provider" {
  command = plan

  plan_options {
    target = [terraform_data.validate_experimental]
  }

  variables {
    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
      }
      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-invalid-provider"
          subnet_ids = ["subnet-invalid-provider"]
        }
      }

      multi_runner_config = {
        microvm = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
          }
          compute_provider = {}
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64"]]
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_experimental]
}

run "experimental_v2_rejects_invalid_ssm_housekeeper_state" {
  command = plan

  plan_options {
    target = [terraform_data.validate_experimental]
  }

  variables {
    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
      }
      compute_provider = {
        ec2 = {
          vpc_id     = "vpc-invalid-housekeeper"
          subnet_ids = ["subnet-invalid-housekeeper"]
        }
      }

      multi_runner_config = {
        invalid = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
          }
          ssm = {
            housekeeper = {
              state = "PAUSED"
            }
          }
          compute_provider = {
            ec2 = {
              instance_types = ["m5.large"]
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64"]]
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_experimental]
}
