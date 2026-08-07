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
    prefix                      = "job-retry-test"
    architecture                = "arm64"
    runtime                     = "nodejs24.x"
    log_level                   = "trace"
    log_class                   = "INFREQUENT_ACCESS"
    enable_organization_runners = false
    ghes_url                    = ""
    user_agent                  = "job-retry-test"
    runner_name_prefix          = "required-prefix-"
    environment_variables = {
      CUSTOM_ENV         = "preserved"
      RUNNER_NAME_PREFIX = "caller-prefix-"
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
    kms_key = {
      arn = "arn:aws:kms:eu-west-1:123456789012:key/job-retry-test"
    }
    metrics = {
      namespace = "JobRetryTest"
    }
    s3_bucket = "lambda-artifacts"
    s3_key    = "job-retry.zip"
    sqs_build_queue = {
      url = "https://sqs.eu-west-1.amazonaws.com/123456789012/build-queue"
      arn = "arn:aws:sqs:eu-west-1:123456789012:build-queue"
    }
  }
}

run "preserves_optional_lambda_configuration" {
  command = plan

  assert {
    condition     = output.lambda.function.function.environment[0].variables["CUSTOM_ENV"] == "preserved"
    error_message = "Caller-provided job-retry environment variables must be preserved."
  }

  assert {
    condition     = output.lambda.function.function.environment[0].variables["RUNNER_NAME_PREFIX"] == "required-prefix-"
    error_message = "Required job-retry environment variables must override caller-provided values."
  }

  assert {
    condition     = output.lambda.log_group.log_group_class == "INFREQUENT_ACCESS"
    error_message = "The job-retry log-group class must be preserved through the typed child-module boundary."
  }

  assert {
    condition     = length(data.aws_iam_policy_document.job_retry.statement) == 4
    error_message = "A present KMS key object must add the job-retry KMS policy statement."
  }
}
