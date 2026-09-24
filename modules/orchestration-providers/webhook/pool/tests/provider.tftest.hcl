mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"logs:CreateLogStream\",\"Resource\":\"*\"}]}"
    }
  }
}

variables {
  storage_provider = {
    aws = {
      ssm = {
        token_path           = "/github-runner/tokens"
        token_path_arn       = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/tokens"
        config_path          = "/github-runner/config"
        config_path_arn      = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/config"
        kms_key_id           = "arn:aws:kms:eu-west-1:123456789012:key/pool-test"
        parameter_store_tags = "{}"
      }
    }
  }

  config = {
    lambda = {
      log_level                      = "info"
      logging_retention_in_days      = 14
      logging_kms_key_id             = null
      log_class                      = "STANDARD"
      reserved_concurrent_executions = 1
      s3_bucket                      = "lambda-artifacts"
      s3_key                         = "runners.zip"
      s3_object_version              = null
      security_group_ids             = []
      runtime                        = "nodejs24.x"
      architecture                   = "arm64"
      memory_size                    = 256
      timeout                        = 60
      zip                            = "runners.zip"
      subnet_ids                     = []
      principals = [{
        type        = "AWS"
        identifiers = ["arn:aws:iam::123456789012:role/local-testing"]
      }]
    }
    tags = {
      Environment = "pool-test"
    }
    ghes = {
      url        = null
      ssl_verify = true
    }
    github_app_parameters = {
      key_base64 = {
        name = "/github-runner/key-base64"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64"
      }
      id = {
        name = "/github-runner/app-id"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id"
      }
      additional_apps_manifest = {
        name = "/github-runner/additional-apps-manifest"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/additional-apps-manifest"
      }
      additional_app_parameter_arns = [
        "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id-2",
        "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64-2",
        "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/installation-id-2",
      ]
    }
    runner = {
      disable_runner_autoupdate = false
      ephemeral                 = true
      enable_jit_config         = true
      labels                    = ["self-hosted", "microvm"]
      group_name                = "default"
      name_prefix               = "microvm"
      pool_owner                = "example"
      boot_time_in_minutes      = 13
    }
    runners_maximum_count = 10
    prefix                = "pool-test"
    pool = [{
      schedule_expression          = "cron(0 8 * * ? *)"
      schedule_expression_timezone = "UTC"
      size                         = 2
    }]
    include_busy_runners      = false
    role_permissions_boundary = null
    role_path                 = "/"
    lambda_tags               = {}
    user_agent                = "terraform-aws-github-runner"
  }

  runner_provider = {
    type = "microvm"
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
    managed_policy_enabled = true
    managed_policy_arn     = "arn:aws:iam::123456789012:policy/microvm-pool"
  }

  tracing_config = {
    mode                  = "Active"
    capture_http_requests = true
    capture_error         = true
  }
}

run "provider_supplies_only_compute_specific_pool_configuration" {
  command = plan

  override_data {
    target = data.aws_iam_policy_document.lambda_assume_role_policy

    values = {
      json = jsonencode({
        Version   = "2012-10-17"
        Statement = []
      })
    }
  }

  override_data {
    target = data.aws_iam_policy_document.ssm_pool_common

    values = {
      json = jsonencode({
        Version = "2012-10-17"
        Statement = [
          {
            Sid    = "WebhookPoolWriteRuntimeParameters"
            Effect = "Allow"
            Action = ["ssm:AddTagsToResource", "ssm:PutParameter"]
            Resource = [
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/tokens",
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/tokens/*",
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/config",
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/config/*",
            ]
          },
          {
            Sid    = "WebhookPoolReadRunnerConfigParameters"
            Effect = "Allow"
            Action = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
            Resource = [
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/config",
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/config/*",
            ]
          },
          {
            Sid    = "WebhookPoolReadGitHubAppParameters"
            Effect = "Allow"
            Action = ["ssm:GetParameter", "ssm:GetParameters"]
            Resource = [
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id",
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64",
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id-2",
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64-2",
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/installation-id-2",
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/additional-apps-manifest",
            ]
          },
          {
            Sid      = "WebhookPoolDecryptParameterStore"
            Effect   = "Allow"
            Action   = ["kms:Decrypt"]
            Resource = ["arn:aws:kms:eu-west-1:123456789012:key/pool-test"]
          },
        ]
      })
    }
  }

  assert {
    condition = (
      length(data.aws_iam_policy_document.lambda_assume_role_policy.statement[0].principals) == 2 &&
      contains(data.aws_iam_policy_document.lambda_assume_role_policy.statement[0].principals[*].type, "AWS")
    )
    error_message = "The pool Lambda trust policy must include configured additional principals."
  }

  assert {
    condition     = toset(keys(output.pool)) == toset(["lambda", "log_group", "role"])
    error_message = "The pool module must expose its resources through one nested output."
  }

  assert {
    condition = (
      aws_lambda_function.pool.environment[0].variables["RUNNER_OWNER"] == "example"
      && aws_lambda_function.pool.environment[0].variables["RUNNERS_MAXIMUM_COUNT"] == "10"
      && aws_lambda_function.pool.environment[0].variables["RUNNER_BOOT_TIME_IN_MINUTES"] == "13"
    )
    error_message = "The pool module must assemble common runner registration values and webhook-provider capacity and boot-time settings."
  }

  assert {
    condition = (
      aws_lambda_function.pool.environment[0].variables["PARAMETER_GITHUB_APP_ID_NAME"] == "/github-runner/app-id"
      && aws_lambda_function.pool.environment[0].variables["PARAMETER_GITHUB_APP_KEY_BASE64_NAME"] == "/github-runner/key-base64"
      && aws_lambda_function.pool.environment[0].variables["PARAMETER_GITHUB_APPS_MANIFEST_NAME"] == "/github-runner/additional-apps-manifest"
      && contains(one([
        for statement in data.aws_iam_policy_document.ssm_pool_common.statement : statement.resources
        if statement.sid == "WebhookPoolReadGitHubAppParameters"
      ]), "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id-2")
      && contains(one([
        for statement in data.aws_iam_policy_document.ssm_pool_common.statement : statement.resources
        if statement.sid == "WebhookPoolReadGitHubAppParameters"
      ]), "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64-2")
      && contains(one([
        for statement in data.aws_iam_policy_document.ssm_pool_common.statement : statement.resources
        if statement.sid == "WebhookPoolReadGitHubAppParameters"
      ]), "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/installation-id-2")
      && contains(one([
        for statement in data.aws_iam_policy_document.ssm_pool_common.statement : statement.resources
        if statement.sid == "WebhookPoolReadGitHubAppParameters"
      ]), "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/additional-apps-manifest")
    )
    error_message = "Pool must receive the new GitHub App parameter format and grant access to every corresponding SSM ARN."
  }

  assert {
    condition     = aws_lambda_function.pool.environment[0].variables["MICROVM_CLUSTER"] == "runner-cluster"
    error_message = "The pool module must merge compute-provider environment variables into the Lambda environment."
  }

  assert {
    condition     = !contains(keys(aws_lambda_function.pool.environment[0].variables), "AMI_ID_SSM_PARAMETER_NAME")
    error_message = "The common pool module must not add EC2-specific environment variables."
  }

  assert {
    condition     = jsondecode(aws_scheduler_schedule.pool["0"].target[0].input).type == "microvm"
    error_message = "The pool scheduler payload must select the configured compute provider."
  }

  assert {
    condition     = length(data.aws_iam_policy_document.pool.source_policy_documents) == 2
    error_message = "The pool role policy must merge the common and compute-provider policy documents."
  }

  assert {
    condition = (
      length(data.aws_iam_policy_document.ssm_pool_common.statement) == 4
      && one([
        for statement in data.aws_iam_policy_document.ssm_pool_common.statement : statement
        if statement.sid == "WebhookPoolDecryptParameterStore"
      ]).resources == toset(["arn:aws:kms:eu-west-1:123456789012:key/pool-test"])
    )
    error_message = "The pool KMS policy statement must consume the scalar key ARN."
  }

  assert {
    condition = (
      one([
        for statement in data.aws_iam_policy_document.ssm_pool_common.statement : statement
        if statement.sid == "WebhookPoolWriteRuntimeParameters"
        ]).resources == toset([
        "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/tokens",
        "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/tokens/*",
        "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/config",
        "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/config/*",
      ])
      && !contains(one([
        for statement in data.aws_iam_policy_document.ssm_pool_common.statement : statement
        if statement.sid == "WebhookPoolWriteRuntimeParameters"
      ]).resources, "*")
    )
    error_message = "The pool Lambda must scope runtime SSM writes to the token and runner-config parameter paths."
  }

  assert {
    condition = (
      data.aws_iam_policy_document.lambda_xray[0].statement[0].sid == "AllowXRay"
      && data.aws_iam_policy_document.lambda_xray[0].statement[0].resources == toset(["*"])
      && toset(data.aws_iam_policy_document.lambda_xray[0].statement[0].actions) == toset([
        "xray:BatchGetTraces",
        "xray:GetTraceSummaries",
        "xray:PutTelemetryRecords",
        "xray:PutTraceSegments",
      ])
    )
    error_message = "Only the resource-agnostic X-Ray APIs may retain a wildcard resource in the pool policies."
  }

  assert {
    condition     = length(aws_iam_role_policy_attachment.provider) == 1
    error_message = "The optional compute-provider managed policy must be attached to the pool role."
  }
}

run "omits_optional_kms_statement" {
  command = plan

  override_data {
    target = data.aws_iam_policy_document.ssm_pool_common

    values = {
      json = jsonencode({
        Version = "2012-10-17"
        Statement = [
          {
            Sid    = "WebhookPoolWriteRuntimeParameters"
            Effect = "Allow"
            Action = ["ssm:AddTagsToResource", "ssm:PutParameter"]
            Resource = [
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/tokens",
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/tokens/*",
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/config",
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/config/*",
            ]
          },
          {
            Sid    = "WebhookPoolReadRunnerConfigParameters"
            Effect = "Allow"
            Action = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
            Resource = [
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/config",
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/config/*",
            ]
          },
          {
            Sid    = "WebhookPoolReadGitHubAppParameters"
            Effect = "Allow"
            Action = ["ssm:GetParameter", "ssm:GetParameters"]
            Resource = [
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id",
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64",
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id-2",
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64-2",
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/installation-id-2",
              "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/additional-apps-manifest",
            ]
          },
        ]
      })
    }
  }

  variables {
    storage_provider = merge(var.storage_provider, {
      aws = merge(var.storage_provider.aws, {
        ssm = merge(var.storage_provider.aws.ssm, {
          kms_key_id = null
        })
      })
    })
  }

  assert {
    condition = (
      length(data.aws_iam_policy_document.ssm_pool_common.statement) == 3
      && length([
        for statement in data.aws_iam_policy_document.ssm_pool_common.statement : statement
        if anytrue([for action in statement.actions : startswith(action, "kms:")])
      ]) == 0
    )
    error_message = "A null Parameter Store key must omit the optional pool KMS statement."
  }
}

run "does_not_grant_ssm_permissions_when_storage_provider_is_null" {
  command = plan

  variables {
    storage_provider = {
      aws = {
        ssm = null
      }
    }
  }

  assert {
    condition = (
      length([
        for statement in data.aws_iam_policy_document.ssm_pool_common.statement : statement
        if anytrue([for action in statement.actions : startswith(action, "ssm:")])
      ]) == 0
      && !contains(keys(aws_lambda_function.pool.environment[0].variables), "PARAMETER_GITHUB_APP_ID_NAME")
      && !contains(keys(aws_lambda_function.pool.environment[0].variables), "PARAMETER_GITHUB_APP_KEY_BASE64_NAME")
      && !contains(keys(aws_lambda_function.pool.environment[0].variables), "PARAMETER_GITHUB_APPS_MANIFEST_NAME")
      && !contains(keys(aws_lambda_function.pool.environment[0].variables), "SSM_TOKEN_PATH")
      && !contains(keys(aws_lambda_function.pool.environment[0].variables), "SSM_CONFIG_PATH")
      && !contains(keys(aws_lambda_function.pool.environment[0].variables), "SSM_PARAMETER_STORE_TAGS")
      && length([
        for statement in data.aws_iam_policy_document.pool.statement : statement
        if anytrue([for action in statement.actions : startswith(action, "ssm:")])
      ]) == 0
    )
    error_message = "A null SSM storage provider must not expose SSM environment variables or permissions."
  }
}

run "rejects_empty_compute_provider_type" {
  command = plan

  plan_options {
    target = [terraform_data.validate_config]
  }

  variables {
    runner_provider = merge(var.runner_provider, {
      type = " "
    })
  }

  expect_failures = [terraform_data.validate_config]
}

run "rejects_invalid_compute_provider_policy" {
  command = plan

  plan_options {
    target = [terraform_data.validate_config]
  }

  variables {
    runner_provider = merge(var.runner_provider, {
      iam_policy_json = "not-json"
    })
  }

  expect_failures = [terraform_data.validate_config]
}

run "requires_enabled_compute_provider_managed_policy_arn" {
  command = plan

  plan_options {
    target = [terraform_data.validate_config]
  }

  variables {
    runner_provider = merge(var.runner_provider, {
      managed_policy_enabled = true
      managed_policy_arn     = null
    })
  }

  expect_failures = [terraform_data.validate_config]
}
