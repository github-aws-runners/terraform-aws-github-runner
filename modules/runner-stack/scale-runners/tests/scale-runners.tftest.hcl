mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/scale-runners-test"
    }
  }
}

variables {
  aws_partition = "aws-us-gov"

  config = {
    prefix = "scale-runners-test"
    lambda = {
      artifact = {
        zip = "runners.zip"
        s3 = {
          bucket         = "lambda-artifacts"
          key            = "runners.zip"
          object_version = "test-version"
        }
      }
      runtime      = "nodejs24.x"
      architecture = "arm64"
      vpc = {
        subnet_ids         = ["subnet-12345678"]
        security_group_ids = ["sg-12345678"]
      }
      role = {
        path                 = "/scale-runners-test/"
        permissions_boundary = "arn:aws-us-gov:iam::123456789012:policy/permissions-boundary"
        principals = [{
          type        = "AWS"
          identifiers = ["arn:aws-us-gov:iam::123456789012:role/local-testing"]
        }]
      }
    }
    runner = {
      os                   = "windows"
      auto_update_disabled = true
      ephemeral            = true
      jit_config_enabled   = true
      labels               = ["Self-Hosted", "MicroVM"]
      group_name           = "test-group"
      name_prefix          = "test-runner-"
      maximum_count        = 7
    }
    github = {
      organization_runners = true
      enterprise_server = {
        url        = "https://github.example.com"
        ssl_verify = false
      }
      user_agent = "scale-runners-test"
      app_parameters = {
        key_base64 = [
          {
            name = "/github-runner/key-base64"
            arn  = "arn:aws-us-gov:ssm:us-gov-west-1:123456789012:parameter/github-runner/key-base64"
          },
          {
            name = "/github-runner/key-base64-2"
            arn  = "arn:aws-us-gov:ssm:us-gov-west-1:123456789012:parameter/github-runner/key-base64-2"
          },
        ]
        id = [
          {
            name = "/github-runner/app-id"
            arn  = "arn:aws-us-gov:ssm:us-gov-west-1:123456789012:parameter/github-runner/app-id"
          },
          {
            name = "/github-runner/app-id-2"
            arn  = "arn:aws-us-gov:ssm:us-gov-west-1:123456789012:parameter/github-runner/app-id-2"
          },
        ]
        installation_id = [
          null,
          {
            name = "/github-runner/installation-id-2"
            arn  = "arn:aws-us-gov:ssm:us-gov-west-1:123456789012:parameter/github-runner/installation-id-2"
          },
        ]
      }
    }
    queue = {
      build = {
        arn = "arn:aws-us-gov:sqs:us-gov-west-1:123456789012:build-queue"
      }
      event_source_mapping = {
        batch_size                         = 25
        maximum_batching_window_in_seconds = 5
      }
    }
    ssm = {
      token_path      = "/github-runner/tokens"
      config_path     = "/github-runner/config"
      config_path_arn = "arn:aws-us-gov:ssm:us-gov-west-1:123456789012:parameter/github-runner/config"
      parameter_store_tags = jsonencode([{
        Key   = "Environment"
        Value = "test"
      }])
      kms_key_id = "arn:aws-us-gov:kms:us-gov-west-1:123456789012:key/scale-runners-test"
    }
    observability = {
      logs = {
        level             = "debug"
        retention_in_days = 14
        kms_key_id        = "arn:aws-us-gov:kms:us-gov-west-1:123456789012:key/logs"
        class             = "INFREQUENT_ACCESS"
      }
      tracing = {
        mode                  = "Active"
        capture_http_requests = true
        capture_error         = true
      }
      metrics = {
        enable    = true
        namespace = "ScaleRunnersTest"
        metric = {
          enable_github_app_rate_limit = true
        }
      }
    }
    scale_up = {
      memory_size                    = 768
      timeout                        = 90
      reserved_concurrent_executions = 2
      job_queued_check_enabled       = true
      tags = {
        resources            = { Scope = "scale-up" }
        lambda               = { Scope = "scale-up-lambda" }
        log_group            = { Scope = "scale-up-log" }
        event_source_mapping = { Scope = "scale-up-queue" }
      }
    }
    scale_down = {
      memory_size                     = 640
      timeout                         = 75
      schedule_expression             = "rate(10 minutes)"
      minimum_running_time_in_minutes = null
      idle_config = [{
        cron             = "* * * * *"
        timeZone         = "UTC"
        idleCount        = 2
        evictionStrategy = "oldest_first"
      }]
      tags = {
        resources = { Scope = "scale-down" }
        lambda    = { Scope = "scale-down-lambda" }
        log_group = { Scope = "scale-down-log" }
      }
    }
    job_retry = {
      enabled          = true
      max_attempts     = 4
      delay_in_seconds = 120
      delay_backoff    = 3
      queue = {
        arn = "arn:aws-us-gov:sqs:us-gov-west-1:123456789012:job-retry"
        url = "https://sqs.us-gov-west-1.amazonaws.com/123456789012/job-retry"
      }
    }
  }

  runner_provider = {
    type = "microvm"
    scale_up = {
      environment_variables = {
        MICROVM_CLUSTER = "runner-cluster"
      }
      iam_policy_json = jsonencode({
        Version = "2012-10-17"
        Statement = [{
          Effect   = "Allow"
          Action   = ["microvm:CreateRunner"]
          Resource = ["*"]
        }]
      })
      additional_iam_policy_json = jsonencode({
        Version = "2012-10-17"
        Statement = [{
          Effect   = "Allow"
          Action   = ["iam:CreateServiceLinkedRole"]
          Resource = ["*"]
        }]
      })
      managed_policy = {
        arn = "arn:aws-us-gov:iam::123456789012:policy/microvm-scale-up"
      }
    }
    scale_down = {
      environment_variables = {
        MICROVM_CLUSTER = "runner-cluster"
      }
      iam_policy_json = jsonencode({
        Version = "2012-10-17"
        Statement = [{
          Effect   = "Allow"
          Action   = ["microvm:DeleteRunner"]
          Resource = ["*"]
        }]
      })
    }
  }
}

run "assembles_provider_neutral_scaling_control_plane" {
  command = plan

  assert {
    condition = (
      length(data.aws_iam_policy_document.lambda_assume_role.statement[0].principals) == 2 &&
      contains(data.aws_iam_policy_document.lambda_assume_role.statement[0].principals[*].type, "AWS")
    )
    error_message = "The scaling Lambda trust policy must include configured additional principals."
  }

  assert {
    condition = (
      toset(keys(output.scale_up)) == toset(["lambda", "log_group", "role"])
      && toset(keys(output.scale_down)) == toset(["lambda", "log_group", "role"])
    )
    error_message = "Scale runners must expose nested scale-up and scale-down Lambda resource contracts."
  }

  assert {
    condition = (
      aws_lambda_function.scale_up.environment[0].variables["COMPUTE_PROVIDER_TYPE"] == "microvm"
      && aws_lambda_function.scale_down.environment[0].variables["COMPUTE_PROVIDER_TYPE"] == "microvm"
      && aws_lambda_function.scale_up.environment[0].variables["MICROVM_CLUSTER"] == "runner-cluster"
      && aws_lambda_function.scale_down.environment[0].variables["MICROVM_CLUSTER"] == "runner-cluster"
      && !contains(keys(aws_lambda_function.scale_up.environment[0].variables), "INSTANCE_TYPES")
    )
    error_message = "The common scaling Lambdas must select the provider and merge only its environment fragments."
  }

  assert {
    condition = (
      aws_lambda_function.scale_up.environment[0].variables["LOG_LEVEL"] == "DEBUG"
      && aws_lambda_function.scale_up.environment[0].variables["RUNNER_LABELS"] == "self-hosted,microvm"
      && aws_lambda_function.scale_up.environment[0].variables["MINIMUM_RUNNING_TIME_IN_MINUTES"] == "15"
      && aws_lambda_function.scale_down.environment[0].variables["MINIMUM_RUNNING_TIME_IN_MINUTES"] == "15"
      && aws_lambda_function.scale_up.environment[0].variables["NODE_TLS_REJECT_UNAUTHORIZED"] == "0"
      && jsondecode(aws_lambda_function.scale_up.environment[0].variables["SSM_PARAMETER_STORE_TAGS"])[0].Value == "test"
    )
    error_message = "Scale runners must assemble shared runner, logging, TLS, lifetime, and Parameter Store environment variables."
  }

  assert {
    condition = (
      aws_lambda_function.scale_up.environment[0].variables["PARAMETER_GITHUB_APP_ID_NAME"] == "/github-runner/app-id:/github-runner/app-id-2"
      && aws_lambda_function.scale_down.environment[0].variables["PARAMETER_GITHUB_APP_KEY_BASE64_NAME"] == "/github-runner/key-base64:/github-runner/key-base64-2"
      && aws_lambda_function.scale_up.environment[0].variables["PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME"] == ":/github-runner/installation-id-2"
      && contains(data.aws_iam_policy_document.scale_up_common.statement[1].resources, "arn:aws-us-gov:ssm:us-gov-west-1:123456789012:parameter/github-runner/app-id-2")
      && contains(data.aws_iam_policy_document.scale_down_common.statement[0].resources, "arn:aws-us-gov:ssm:us-gov-west-1:123456789012:parameter/github-runner/key-base64-2")
      && contains(data.aws_iam_policy_document.scale_down_common.statement[0].resources, "arn:aws-us-gov:ssm:us-gov-west-1:123456789012:parameter/github-runner/installation-id-2")
    )
    error_message = "Scale-up and scale-down must pass every GitHub App parameter and grant access to every corresponding SSM ARN."
  }

  assert {
    condition = (
      jsondecode(aws_lambda_function.scale_up.environment[0].variables["JOB_RETRY_CONFIG"]).queueUrl == "https://sqs.us-gov-west-1.amazonaws.com/123456789012/job-retry"
      && jsondecode(aws_lambda_function.scale_up.environment[0].variables["JOB_RETRY_CONFIG"]).maxAttempts == "4"
      && jsondecode(aws_lambda_function.scale_down.environment[0].variables["SCALE_DOWN_CONFIG"])[0].idleCount == 2
    )
    error_message = "Scale runners must preserve job-retry and idle-runner configuration at the Lambda boundary."
  }

  assert {
    condition = (
      aws_lambda_function.scale_up.memory_size == 768
      && aws_lambda_function.scale_up.timeout == 90
      && aws_lambda_function.scale_up.reserved_concurrent_executions == 2
      && aws_lambda_function.scale_down.memory_size == 640
      && aws_lambda_function.scale_down.timeout == 75
      && aws_cloudwatch_log_group.scale_up.log_group_class == "INFREQUENT_ACCESS"
      && aws_cloudwatch_log_group.scale_down.retention_in_days == 14
    )
    error_message = "The child module must preserve Lambda sizing and log-group configuration."
  }

  assert {
    condition = (
      aws_lambda_event_source_mapping.scale_up.event_source_arn == "arn:aws-us-gov:sqs:us-gov-west-1:123456789012:build-queue"
      && aws_lambda_event_source_mapping.scale_up.batch_size == 25
      && aws_lambda_event_source_mapping.scale_up.maximum_batching_window_in_seconds == 5
      && aws_lambda_event_source_mapping.scale_up.tags["Scope"] == "scale-up-queue"
      && aws_cloudwatch_event_rule.scale_down.schedule_expression == "rate(10 minutes)"
      && aws_cloudwatch_event_rule.scale_down.tags["Scope"] == "scale-down"
    )
    error_message = "Scale-up queue and scale-down schedule triggers must remain owned by the child module."
  }

  assert {
    condition = (
      aws_lambda_function.scale_up.tags["Scope"] == "scale-up-lambda"
      && aws_cloudwatch_log_group.scale_up.tags["Scope"] == "scale-up-log"
      && aws_iam_role.scale_up.tags["Scope"] == "scale-up"
      && aws_lambda_function.scale_down.tags["Scope"] == "scale-down-lambda"
      && aws_cloudwatch_log_group.scale_down.tags["Scope"] == "scale-down-log"
      && aws_iam_role.scale_down.tags["Scope"] == "scale-down"
    )
    error_message = "Resolved component tag maps must reach the resources owned by scale runners."
  }

  assert {
    condition = (
      length(aws_lambda_function.scale_up.vpc_config) == 1
      && length(aws_lambda_function.scale_down.vpc_config) == 1
      && length(aws_iam_role_policy_attachment.scale_up_vpc_execution_role) == 1
      && length(aws_iam_role_policy_attachment.scale_down_vpc_execution_role) == 1
      && aws_iam_role_policy_attachment.scale_up_vpc_execution_role[0].policy_arn == "arn:aws-us-gov:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
    )
    error_message = "A complete Lambda VPC configuration must configure both Lambdas and their partition-aware execution policies."
  }

  assert {
    condition = (
      length(aws_lambda_function.scale_up.tracing_config) == 1
      && length(aws_lambda_function.scale_down.tracing_config) == 1
      && length(aws_iam_role_policy.scale_up_xray) == 1
      && length(aws_iam_role_policy.scale_down_xray) == 1
    )
    error_message = "Active tracing must configure both Lambdas and attach their X-Ray policies."
  }

  assert {
    condition = (
      length(aws_iam_role_policy.service_linked_role) == 1
      && length(aws_iam_role_policy_attachment.provider) == 1
      && aws_iam_role_policy_attachment.provider[0].policy_arn == "arn:aws-us-gov:iam::123456789012:policy/microvm-scale-up"
      && length(aws_iam_role_policy.job_retry_sqs_publish) == 1
    )
    error_message = "Optional compute-provider and job-retry IAM integrations must be attached to the scale-up role."
  }

  assert {
    condition = (
      length(data.aws_iam_policy_document.scale_up.source_policy_documents) == 2
      && length(data.aws_iam_policy_document.scale_down.source_policy_documents) == 2
      && length(data.aws_iam_policy_document.scale_up_common.statement) == 4
      && length(data.aws_iam_policy_document.scale_down_common.statement) == 2
      && data.aws_iam_policy_document.scale_up_common.statement[3].resources == toset(["arn:aws-us-gov:kms:us-gov-west-1:123456789012:key/scale-runners-test"])
      && data.aws_iam_policy_document.scale_down_common.statement[1].resources == toset(["arn:aws-us-gov:kms:us-gov-west-1:123456789012:key/scale-runners-test"])
      && length(data.aws_iam_policy_document.scale_up_job_retry_publish) == 1
    )
    error_message = "Common, provider, KMS, and retry IAM policy fragments must retain their conditional plan shape."
  }
}
