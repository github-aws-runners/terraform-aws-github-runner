mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/job-retry-test"
    }
  }
}

variables {
  config = {
    prefix        = "job-retry-test"
    aws_partition = "aws"
    lambda = {
      artifact = {
        zip = "unused.zip"
        s3 = {
          bucket = "lambda-artifacts"
          key    = "job-retry.zip"
        }
      }
      architecture                   = "arm64"
      runtime                        = "nodejs24.x"
      memory_size                    = 256
      timeout                        = 30
      reserved_concurrent_executions = 1
      environment_variables = {
        CUSTOM_ENV         = "preserved"
        RUNNER_NAME_PREFIX = "caller-prefix-"
      }
      vpc = {
        security_group_ids = ["sg-12345678"]
        subnet_ids         = ["subnet-12345678"]
      }
      role = {
        path = "/job-retry-test/"
        principals = [{
          type        = "AWS"
          identifiers = ["arn:aws:iam::123456789012:root"]
        }]
      }
    }
    runner = {
      name_prefix = "required-prefix-"
    }
    github = {
      organization_runners = false
      enterprise_server = {
        url = ""
      }
      user_agent = "job-retry-test"
      app_parameters = {
        key_base64 = [
          {
            name = "/github-runner/key-base64"
            arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64"
          },
          {
            name = "/github-runner/key-base64-2"
            arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64-2"
          },
        ]
        id = [
          {
            name = "/github-runner/app-id"
            arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id"
          },
          {
            name = "/github-runner/app-id-2"
            arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id-2"
          },
        ]
        installation_id = [
          null,
          {
            name = "/github-runner/installation-id-2"
            arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/installation-id-2"
          },
        ]
      }
    }
    queue = {
      build = {
        url = "https://sqs.eu-west-1.amazonaws.com/123456789012/build-queue"
        arn = "arn:aws:sqs:eu-west-1:123456789012:build-queue"
      }
      event_source_mapping = {
        batch_size                         = 10
        maximum_batching_window_in_seconds = 0
      }
      encryption = {
        sqs_managed_sse_enabled = true
      }
    }
    ssm = {
      kms_key = {
        arn = "arn:aws:kms:eu-west-1:123456789012:key/job-retry-test"
      }
    }
    observability = {
      logs = {
        level             = "trace"
        class             = "INFREQUENT_ACCESS"
        retention_in_days = 180
      }
      tracing = {
        mode                  = "Active"
        capture_http_requests = false
        capture_error         = false
      }
      metrics = {
        enable    = false
        namespace = "JobRetryTest"
        metric = {
          enable_github_app_rate_limit = true
          enable_job_retry             = true
        }
      }
    }
    tags = {
      resources            = { scope = "resources" }
      lambda               = { scope = "lambda" }
      log_group            = { scope = "log-group" }
      queue                = { scope = "queue" }
      event_source_mapping = { scope = "event-source-mapping" }
    }
  }
}

run "preserves_nested_job_retry_configuration" {
  command = plan

  assert {
    condition     = output.lambda.function.environment[0].variables["CUSTOM_ENV"] == "preserved"
    error_message = "Caller-provided job-retry environment variables must be preserved."
  }

  assert {
    condition     = output.lambda.function.environment[0].variables["RUNNER_NAME_PREFIX"] == "required-prefix-"
    error_message = "Required job-retry environment variables must override caller-provided values."
  }

  assert {
    condition = (
      output.lambda.function.environment[0].variables["PARAMETER_GITHUB_APP_ID_NAME"] == "/github-runner/app-id:/github-runner/app-id-2"
      && output.lambda.function.environment[0].variables["PARAMETER_GITHUB_APP_KEY_BASE64_NAME"] == "/github-runner/key-base64:/github-runner/key-base64-2"
      && output.lambda.function.environment[0].variables["PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME"] == ":/github-runner/installation-id-2"
      && contains(data.aws_iam_policy_document.job_retry.statement[0].resources, "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id-2")
      && contains(data.aws_iam_policy_document.job_retry.statement[0].resources, "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64-2")
      && contains(data.aws_iam_policy_document.job_retry.statement[0].resources, "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/installation-id-2")
    )
    error_message = "Job retry must pass every GitHub App parameter and grant access to every corresponding SSM ARN."
  }

  assert {
    condition = (
      toset(keys(output.lambda)) == toset(["function", "log_group", "role"])
      && output.lambda.function.s3_bucket == "lambda-artifacts"
      && output.lambda.function.s3_key == "job-retry.zip"
      && output.lambda.function.reserved_concurrent_executions == 1
    )
    error_message = "The nested Lambda configuration and direct resource output contract must be preserved."
  }

  assert {
    condition = (
      output.lambda.function.tags == tomap({ scope = "lambda" })
      && output.lambda.log_group.tags == tomap({ scope = "log-group" })
      && output.lambda.role.tags == tomap({ scope = "resources" })
      && output.job_retry_check_queue.tags == tomap({ scope = "queue" })
      && aws_lambda_event_source_mapping.job_retry.tags == tomap({ scope = "event-source-mapping" })
    )
    error_message = "Resolved nested tag maps must be applied to their owned resources."
  }

  assert {
    condition = (
      output.lambda.log_group.log_group_class == "INFREQUENT_ACCESS"
      && length(data.aws_iam_policy_document.job_retry.statement) == 4
      && length(aws_lambda_function.job_retry.vpc_config) == 1
      && length(aws_iam_role_policy_attachment.job_retry_vpc_execution_role) == 1
      && length(aws_iam_role_policy.job_retry_xray) == 1
      && length(data.aws_iam_policy_document.lambda_assume_role.statement[0].principals) == 2
    )
    error_message = "Logging, KMS, complete VPC, tracing, and extra role-principal configuration must be preserved."
  }
}

run "does_not_enable_partial_vpc_configuration" {
  command = plan

  variables {
    config = {
      prefix        = "job-retry-test"
      aws_partition = "aws"
      lambda = {
        artifact = {
          zip = "unused.zip"
          s3 = {
            bucket = "lambda-artifacts"
            key    = "job-retry.zip"
          }
        }
        architecture                   = "arm64"
        runtime                        = "nodejs24.x"
        memory_size                    = 256
        timeout                        = 30
        reserved_concurrent_executions = 1
        environment_variables          = {}
        vpc = {
          security_group_ids = []
          subnet_ids         = ["subnet-12345678"]
        }
        role = {
          path       = "/job-retry-test/"
          principals = []
        }
      }
      runner = {
        name_prefix = ""
      }
      github = {
        organization_runners = false
        enterprise_server    = {}
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
      }
      queue = {
        build = {
          url = "https://sqs.eu-west-1.amazonaws.com/123456789012/build-queue"
          arn = "arn:aws:sqs:eu-west-1:123456789012:build-queue"
        }
        event_source_mapping = {
          batch_size                         = 10
          maximum_batching_window_in_seconds = 0
        }
        encryption = {
          sqs_managed_sse_enabled = true
        }
      }
      ssm = {}
      observability = {
        logs = {
          level             = "info"
          class             = "STANDARD"
          retention_in_days = 180
        }
        tracing = {
          capture_http_requests = false
          capture_error         = false
        }
        metrics = {
          enable    = false
          namespace = "GitHub Runners"
          metric = {
            enable_github_app_rate_limit = true
            enable_job_retry             = true
          }
        }
      }
      tags = {
        resources            = {}
        lambda               = {}
        log_group            = {}
        queue                = {}
        event_source_mapping = {}
      }
    }
  }

  assert {
    condition = (
      length(aws_lambda_function.job_retry.vpc_config) == 0
      && length(aws_iam_role_policy_attachment.job_retry_vpc_execution_role) == 0
    )
    error_message = "The VPC block and managed policy must both remain disabled until subnet and security-group lists are complete."
  }
}
