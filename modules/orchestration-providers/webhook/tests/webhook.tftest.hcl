mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/webhook-orchestration-test"
    }
  }
}

variables {
  prefix = "webhook-test"

  tags = {
    Scope      = "common"
    Precedence = "common"
  }

  runner = {
    os                   = "linux"
    auto_update_disabled = false
    labels               = ["self-hosted", "linux"]
    group_name           = "default"
    name_prefix          = "webhook-test-"
  }

  github = {
    app_parameters = {
      key_base64 = [{
        name = "/github-runner/key-base64"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64"
      }]
      id = [{
        name = "/github-runner/app-id"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id"
      }]
      installation_id = [null]
    }
    enterprise_server = {
      url        = null
      ssl_verify = true
    }
    user_agent = "webhook-orchestration-test"
  }

  lambda = {
    artifact = {
      s3 = {
        bucket = "lambda-artifacts"
      }
    }
    runtime            = "nodejs24.x"
    architecture       = "arm64"
    subnet_ids         = []
    security_group_ids = []
    tags = {
      Lambda     = "yes"
      Precedence = "lambda"
    }
    role = {
      path = "/webhook-test/"
    }
  }

  ssm = {
    token_path           = "/github-runner/tokens"
    token_path_arn       = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/tokens"
    config_path          = "/github-runner/config"
    config_path_arn      = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/config"
    kms_key_id           = "arn:aws:kms:eu-west-1:123456789012:key/webhook-test"
    parameter_store_tags = "[]"
  }

  observability = {
    logs = {
      level             = "info"
      retention_in_days = 14
      kms_key_id        = null
      class             = "STANDARD"
    }
    tracing = {
      mode                  = null
      capture_http_requests = false
      capture_error         = false
    }
    metrics = {
      enable    = true
      namespace = "WebhookTest"
      metric = {
        enable_github_app_rate_limit = true
        enable_job_retry             = true
      }
    }
  }

  config = {
    runner = {
      boot_time_in_minutes = 11
      ephemeral            = true
      jit_config_enabled   = null
      maximum_count        = 10
    }
    github = {
      organization_runners = true
    }
    queue = {
      build = {
        arn = "arn:aws:sqs:eu-west-1:123456789012:build-queue"
        url = "https://sqs.eu-west-1.amazonaws.com/123456789012/build-queue"
      }
      kms_key_id = "arn:aws:kms:eu-west-1:123456789012:key/build-queue-test"
      tags = {
        Queue = "yes"
      }
    }
    lambda = {
      artifact = {
        s3 = {
          key = "runners.zip"
        }
      }
      scale = {
        up = {
          memory_size                    = 512
          timeout                        = 60
          reserved_concurrent_executions = 1
          job_queued_check_enabled       = null
          event_source_mapping = {
            batch_size                         = 10
            maximum_batching_window_in_seconds = 0
          }
          tags = {
            ScaleUp    = "yes"
            Precedence = "scale-up"
          }
        }
        down = {
          memory_size                     = 512
          timeout                         = 60
          schedule_expression             = "cron(*/5 * * * ? *)"
          minimum_running_time_in_minutes = null
          idle_config                     = []
          tags = {
            ScaleDown = "yes"
          }
        }
      }
      pool = {
        memory_size                    = 512
        timeout                        = 60
        reserved_concurrent_executions = 1
        config = [{
          schedule_expression          = "cron(0 8 * * ? *)"
          schedule_expression_timezone = "UTC"
          size                         = 1
        }]
        include_busy_runners = false
        runner_owner         = "example"
        tags = {
          Pool = "yes"
        }
      }
    }
    job_retry = {
      enabled          = true
      delay_in_seconds = 300
      delay_backoff    = 2
      max_attempts     = 2
      tags = {
        JobRetry = "yes"
      }
      lambda = {
        memory_size                    = 256
        reserved_concurrent_executions = 1
        timeout                        = 30
      }
    }
  }

  runner_provider = {
    type = "test-provider"
    scale_up = {
      environment_variables = {
        TEST_SCALE_UP = "yes"
      }
      iam_policy_json            = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
      additional_iam_policy_json = null
      managed_policy             = null
    }
    scale_down = {
      environment_variables = {
        TEST_SCALE_DOWN = "yes"
      }
      iam_policy_json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
    pool = {
      environment_variables = {
        TEST_POOL = "yes"
      }
      iam_policy_json        = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
      managed_policy_enabled = false
      managed_policy_arn     = null
    }
  }
}

run "owns_webhook_control_plane" {
  command = plan

  assert {
    condition = (
      toset(keys(output.scale_up)) == toset(["lambda", "log_group", "role"])
      && toset(keys(output.scale_down)) == toset(["lambda", "log_group", "role"])
    )
    error_message = "The webhook provider must own and expose both scaling functions."
  }

  assert {
    condition = (
      output.pool != null
      && output.job_retry != null
      && output.job_retry.lambda != null
      && output.job_retry.queue != null
    )
    error_message = "The webhook provider must own the optional pool and job-retry resources when enabled."
  }

  assert {
    condition = (
      output.scale_up.lambda.environment[0].variables["COMPUTE_PROVIDER_TYPE"] == "test-provider"
      && output.scale_up.lambda.environment[0].variables["TEST_SCALE_UP"] == "yes"
      && output.scale_down.lambda.environment[0].variables["TEST_SCALE_DOWN"] == "yes"
      && output.pool.lambda.environment[0].variables["TEST_POOL"] == "yes"
    )
    error_message = "The webhook provider must forward each compute-provider capability to the matching leaf."
  }

  assert {
    condition = (
      output.scale_up.lambda.environment[0].variables["RUNNERS_MAXIMUM_COUNT"] == "10"
      && output.pool.lambda.environment[0].variables["RUNNERS_MAXIMUM_COUNT"] == "10"
      && output.scale_down.lambda.environment[0].variables["RUNNER_BOOT_TIME_IN_MINUTES"] == "11"
      && output.pool.lambda.environment[0].variables["RUNNER_BOOT_TIME_IN_MINUTES"] == "11"
      && output.scale_up.lambda.environment[0].variables["ENABLE_JIT_CONFIG"] == "true"
      && output.pool.lambda.environment[0].variables["ENABLE_JIT_CONFIG"] == "true"
    )
    error_message = "The webhook provider must route its provider-owned runner lifecycle, capacity, and boot-time values without reading them from common runner values."
  }

  assert {
    condition = (
      output.runner_lifecycle.ephemeral
      && output.runner_lifecycle.jit_config_enabled
    )
    error_message = "The webhook provider must expose its resolved lifecycle contract and default JIT configuration to the effective ephemeral mode."
  }

  assert {
    condition = (
      output.scale_up.lambda.s3_bucket == "lambda-artifacts"
      && output.scale_up.lambda.s3_key == "runners.zip"
      && output.scale_down.lambda.s3_bucket == "lambda-artifacts"
      && output.pool.lambda.s3_key == "runners.zip"
    )
    error_message = "The webhook provider must combine the common artifact bucket with its shared runner-control artifact key for scale, pool, and job retry."
  }

  assert {
    condition = (
      output.scale_up.lambda.tags["Scope"] == "common"
      && output.scale_up.lambda.tags["Lambda"] == "yes"
      && output.scale_up.lambda.tags["ScaleUp"] == "yes"
      && output.scale_up.lambda.tags["Precedence"] == "scale-up"
      && output.job_retry.queue.tags["JobRetry"] == "yes"
      && output.job_retry.queue.tags["Queue"] == "yes"
    )
    error_message = "Provider-owned normalization must preserve common, substrate, and webhook component tag precedence."
  }

  assert {
    condition = (
      length(module.pool) == 1
      && length(module.job_retry) == 1
    )
    error_message = "Pool and job-retry leaf ownership must remain inside the webhook provider."
  }
}

run "rejects_conflicting_artifact_sources" {
  command = plan

  plan_options {
    target = [terraform_data.validate_config]
  }

  variables {
    config = merge(var.config, {
      lambda = merge(var.config.lambda, {
        artifact = merge(var.config.lambda.artifact, {
          zip = "runners.zip"
        })
      })
    })
  }

  expect_failures = [terraform_data.validate_config]
}
