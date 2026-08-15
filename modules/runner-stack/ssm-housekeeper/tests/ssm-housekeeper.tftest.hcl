mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/ssm-housekeeper-test"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn = "arn:aws:lambda:eu-west-1:123456789012:function:ssm-housekeeper-test"
    }
  }

  mock_resource "aws_cloudwatch_event_rule" {
    defaults = {
      arn = "arn:aws:events:eu-west-1:123456789012:rule/ssm-housekeeper-test"
    }
  }

  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:eu-west-1:123456789012:log-group:/aws/lambda/ssm-housekeeper-test"
    }
  }
}

variables {
  config = {
    prefix        = "ssm-housekeeper-test"
    aws_partition = "aws-us-gov"
    schedule = {
      expression = "rate(6 hours)"
      state      = "DISABLED"
    }
    cleanup = {
      token_path         = "/custom/runner/tokens"
      parameter_path_arn = "arn:aws-us-gov:ssm:us-gov-west-1:123456789012:parameter/custom/runner/tokens*"
      minimum_days_old   = 7
      dry_run            = true
    }
    lambda = {
      artifact = {
        zip = "unused-with-s3.zip"
        s3 = {
          bucket         = "lambda-artifacts"
          key            = "control-plane/runners.zip"
          object_version = "version-1"
        }
      }
      runtime      = "nodejs24.x"
      architecture = "arm64"
      memory_size  = 384
      timeout      = 45
      vpc = {
        subnet_ids         = []
        security_group_ids = []
      }
      role = {
        path                 = "/runner-stack/"
        permissions_boundary = null
        principals = [{
          type        = "AWS"
          identifiers = ["arn:aws-us-gov:iam::123456789012:role/local-testing"]
        }]
      }
    }
    observability = {
      logs = {
        level             = "debug"
        retention_in_days = 30
        kms_key_id        = null
        class             = "STANDARD"
      }
      tracing = {
        mode                  = null
        capture_http_requests = false
        capture_error         = false
      }
    }
    tags = {
      resources = {
        Scope = "housekeeper"
      }
      lambda = {
        Scope    = "housekeeper"
        Resource = "lambda"
      }
      log_group = {
        Scope    = "housekeeper"
        Resource = "logs"
      }
    }
  }
}

run "configures_schedule_cleanup_and_outputs" {
  command = plan

  assert {
    condition = (
      length(data.aws_iam_policy_document.lambda_assume_role.statement[0].principals) == 2 &&
      contains(data.aws_iam_policy_document.lambda_assume_role.statement[0].principals[*].type, "AWS")
    )
    error_message = "The housekeeper Lambda trust policy must include configured additional principals."
  }

  assert {
    condition = (
      aws_cloudwatch_event_rule.ssm_housekeeper.schedule_expression == "rate(6 hours)" &&
      aws_cloudwatch_event_rule.ssm_housekeeper.state == "DISABLED"
    )
    error_message = "The housekeeper EventBridge rule must use the configured schedule and state."
  }

  assert {
    condition = (
      jsondecode(aws_lambda_function.ssm_housekeeper.environment[0].variables["SSM_CLEANUP_CONFIG"]).tokenPath == "/custom/runner/tokens" &&
      jsondecode(aws_lambda_function.ssm_housekeeper.environment[0].variables["SSM_CLEANUP_CONFIG"]).minimumDaysOld == 7 &&
      jsondecode(aws_lambda_function.ssm_housekeeper.environment[0].variables["SSM_CLEANUP_CONFIG"]).dryRun
    )
    error_message = "The Lambda cleanup configuration must preserve the configured path override, age, and dry-run setting."
  }

  assert {
    condition = contains(
      data.aws_iam_policy_document.ssm_housekeeper.statement[0].resources,
      "arn:aws-us-gov:ssm:us-gov-west-1:123456789012:parameter/custom/runner/tokens*",
    )
    error_message = "The housekeeper IAM policy must authorize the same overridden Parameter Store path supplied to the Lambda."
  }

  assert {
    condition     = toset(keys(output.housekeeper)) == toset(["lambda", "log_group", "role"])
    error_message = "The module must expose Lambda, log-group, and role resources through one nested housekeeper output."
  }

  assert {
    condition = (
      output.housekeeper.lambda.tags == tomap({
        Scope    = "housekeeper"
        Resource = "lambda"
      }) &&
      output.housekeeper.log_group.tags == tomap({
        Scope    = "housekeeper"
        Resource = "logs"
      }) &&
      output.housekeeper.role.tags == tomap({
        Scope = "housekeeper"
      })
    )
    error_message = "Each nested output resource must retain its resolved component tags."
  }

  assert {
    condition = (
      length(aws_lambda_function.ssm_housekeeper.vpc_config) == 0 &&
      length(aws_iam_role_policy_attachment.ssm_housekeeper_vpc_execution_role) == 0 &&
      length(aws_lambda_function.ssm_housekeeper.tracing_config) == 0 &&
      length(aws_iam_role_policy.ssm_housekeeper_xray) == 0
    )
    error_message = "Empty VPC configuration and disabled tracing must not create their optional Lambda or IAM configuration."
  }
}

run "enables_vpc_and_xray_together" {
  command = plan

  variables {
    config = {
      prefix        = "ssm-housekeeper-vpc-test"
      aws_partition = "aws-us-gov"
      schedule = {
        expression = "rate(1 day)"
        state      = "ENABLED"
      }
      cleanup = {
        token_path         = "/github-runner/tokens"
        parameter_path_arn = "arn:aws-us-gov:ssm:us-gov-west-1:123456789012:parameter/github-runner/tokens*"
        minimum_days_old   = 1
        dry_run            = false
      }
      lambda = {
        artifact = {
          zip = "unused-with-s3.zip"
          s3 = {
            bucket = "lambda-artifacts"
            key    = "control-plane/runners.zip"
          }
        }
        runtime      = "nodejs24.x"
        architecture = "arm64"
        memory_size  = 512
        timeout      = 60
        vpc = {
          subnet_ids         = ["subnet-12345678"]
          security_group_ids = ["sg-12345678"]
        }
        role = {
          path                 = "/runner-stack/"
          permissions_boundary = null
        }
      }
      observability = {
        logs = {
          level             = "info"
          retention_in_days = 14
          kms_key_id        = null
          class             = "STANDARD"
        }
        tracing = {
          mode                  = "Active"
          capture_http_requests = true
          capture_error         = true
        }
      }
      tags = {
        resources = {}
        lambda    = {}
        log_group = {}
      }
    }
  }

  assert {
    condition = (
      length(aws_lambda_function.ssm_housekeeper.vpc_config) == 1 &&
      aws_lambda_function.ssm_housekeeper.vpc_config[0].subnet_ids == toset(["subnet-12345678"]) &&
      aws_lambda_function.ssm_housekeeper.vpc_config[0].security_group_ids == toset(["sg-12345678"]) &&
      length(aws_iam_role_policy_attachment.ssm_housekeeper_vpc_execution_role) == 1 &&
      aws_iam_role_policy_attachment.ssm_housekeeper_vpc_execution_role[0].policy_arn == "arn:aws-us-gov:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
    )
    error_message = "A complete VPC configuration must configure the Lambda and attach the partition-aware VPC execution policy."
  }

  assert {
    condition = (
      length(aws_lambda_function.ssm_housekeeper.tracing_config) == 1 &&
      aws_lambda_function.ssm_housekeeper.tracing_config[0].mode == "Active" &&
      length(aws_iam_role_policy.ssm_housekeeper_xray) == 1 &&
      aws_lambda_function.ssm_housekeeper.environment[0].variables["POWERTOOLS_TRACE_ENABLED"] == "true" &&
      aws_lambda_function.ssm_housekeeper.environment[0].variables["POWERTOOLS_TRACER_CAPTURE_HTTPS_REQUESTS"] == "true" &&
      aws_lambda_function.ssm_housekeeper.environment[0].variables["POWERTOOLS_TRACER_CAPTURE_ERROR"] == "true"
    )
    error_message = "Active tracing must configure Lambda tracing, X-Ray IAM permissions, and tracing-helper environment variables."
  }
}
