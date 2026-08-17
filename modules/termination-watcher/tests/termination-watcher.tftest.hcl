mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }

  mock_resource "aws_sqs_queue" {
    defaults = {
      arn = "arn:aws:sqs:eu-west-1:123456789012:termination-watcher-test"
      url = "https://sqs.eu-west-1.amazonaws.com/123456789012/termination-watcher-test"
    }
  }
}

variables {
  config = {
    prefix        = "termination-watcher-test"
    aws_partition = "aws"

    s3_bucket = "lambda-artifacts"
    s3_key    = "termination-watcher.zip"

    environment_variables = {
      CUSTOM_ENV = "preserved"
    }

    tag_filters = {
      "ghr:environment" = "test"
    }

    metrics = {
      enable    = true
      namespace = "TerminationWatcherTest"
      metric = {
        enable_spot_termination         = true
        enable_spot_termination_warning = true
      }
    }

    enable_runner_deregistration = true
    ssm_kms_key_id               = "arn:aws:kms:eu-west-1:123456789012:key/termination-watcher-test"
    github_app_parameters = {
      id = {
        name = "/github-runner/app-id"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id"
      }
      key_base64 = {
        name = "/github-runner/key-base64"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64"
      }
    }
  }
}

run "preserves_environment_and_configures_kms_access" {
  command = plan

  assert {
    condition = alltrue([
      output.spot_termination_notification.lambda.function.environment[0].variables["CUSTOM_ENV"] == "preserved",
      output.spot_termination_handler.lambda.function.environment[0].variables["CUSTOM_ENV"] == "preserved",
      output.deregister_retry.lambda.environment[0].variables["CUSTOM_ENV"] == "preserved",
    ])
    error_message = "Caller-provided environment variables must reach every termination-watcher Lambda."
  }

  assert {
    condition = (
      contains(keys(output.spot_termination_notification.lambda.function.environment[0].variables), "ENABLE_METRICS_SPOT_WARNING")
      && !contains(keys(output.spot_termination_notification.lambda.function.environment[0].variables), "ENABLE_METRICS_SPOT_TERMINATION")
      && contains(keys(output.spot_termination_handler.lambda.function.environment[0].variables), "ENABLE_METRICS_SPOT_TERMINATION")
      && !contains(keys(output.spot_termination_handler.lambda.function.environment[0].variables), "ENABLE_METRICS_SPOT_WARNING")
      && !contains(keys(output.deregister_retry.lambda.environment[0].variables), "ENABLE_METRICS_SPOT_WARNING")
      && !contains(keys(output.deregister_retry.lambda.environment[0].variables), "ENABLE_METRICS_SPOT_TERMINATION")
    )
    error_message = "Generated metric variables must remain scoped to their owning Lambda."
  }

  assert {
    condition = alltrue([
      output.spot_termination_notification.lambda.function.environment[0].variables["TAG_FILTERS"] == jsonencode(var.config.tag_filters),
      output.spot_termination_handler.lambda.function.environment[0].variables["TAG_FILTERS"] == jsonencode(var.config.tag_filters),
      output.deregister_retry.lambda.environment[0].variables["TAG_FILTERS"] == jsonencode(var.config.tag_filters),
    ])
    error_message = "Every termination-watcher Lambda must retain TAG_FILTERS."
  }

  assert {
    condition     = local.config._ssm_kms_key_id == var.config.ssm_kms_key_id
    error_message = "The configured Parameter Store KMS key must reach the canonical watcher configuration."
  }

  assert {
    condition = anytrue([
      for statement in jsondecode(aws_iam_role_policy.deregister_retry_ssm[0].policy).Statement :
      contains(statement.Action, "kms:Decrypt")
      && contains(statement.Resource, var.config.ssm_kms_key_id)
    ])
    error_message = "The deregistration-retry role must receive KMS decrypt access scoped to the configured key."
  }
}

run "uses_inert_kms_arn_when_unset" {
  command = plan

  variables {
    config = {
      prefix    = "termination-watcher-no-kms"
      s3_bucket = "lambda-artifacts"
      s3_key    = "termination-watcher.zip"
    }
  }

  assert {
    condition     = local.config._ssm_kms_key_id == "arn:aws:kms:*:000000000000:key/00000000-0000-0000-0000-000000000000"
    error_message = "An unset Parameter Store KMS key must retain a static, inert IAM resource shape."
  }
}
