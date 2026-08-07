mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"logs:CreateLogStream\",\"Resource\":\"*\"}]}"
    }
  }
}

variables {
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
      parameter_store_tags           = "{}"
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
    }
    runner = {
      disable_runner_autoupdate = false
      ephemeral                 = true
      enable_jit_config         = true
      labels                    = ["self-hosted", "microvm"]
      group_name                = "default"
      name_prefix               = "microvm"
      pool_owner                = "example"
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
    kms_key = {
      arn = "arn:aws:kms:eu-west-1:123456789012:key/pool-test"
    }
    role_path                      = "/"
    ssm_token_path                 = "/github-runner/tokens"
    ssm_config_path                = "/github-runner/config"
    arn_ssm_parameters_path_config = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/config"
    lambda_tags                    = {}
    user_agent                     = "terraform-aws-github-runner"
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
}

run "provider_supplies_only_compute_specific_pool_configuration" {
  command = plan

  assert {
    condition     = toset(keys(output.pool)) == toset(["lambda", "log_group", "role"])
    error_message = "The pool module must expose its resources through one nested output."
  }

  assert {
    condition     = aws_lambda_function.pool.environment[0].variables["RUNNER_OWNER"] == "example"
    error_message = "The pool module must continue to assemble common runner environment variables."
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
    condition     = length(data.aws_iam_policy_document.pool_common.statement) == 4
    error_message = "A present KMS key object must add the pool KMS policy statement."
  }

  assert {
    condition     = length(aws_iam_role_policy_attachment.provider) == 1
    error_message = "The optional compute-provider managed policy must be attached to the pool role."
  }
}
