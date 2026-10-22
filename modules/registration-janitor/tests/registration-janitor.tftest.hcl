mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/janitor" }
  }
  mock_resource "aws_lambda_function" {
    defaults = { arn = "arn:aws:lambda:eu-west-1:123456789012:function:janitor" }
  }
  mock_resource "aws_cloudwatch_event_rule" {
    defaults = { arn = "arn:aws:events:eu-west-1:123456789012:rule/janitor" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:eu-west-1:123456789012:log-group:/aws/lambda/janitor" }
  }
}

override_resource {
  target = aws_sqs_queue.dead_letter
  values = { arn = "arn:aws:sqs:eu-west-1:123456789012:janitor-dlq" }
}

override_resource {
  target = aws_sqs_queue.confirmation
  values = {
    arn = "arn:aws:sqs:eu-west-1:123456789012:janitor-confirmation"
    url = "https://sqs.eu-west-1.amazonaws.com/123456789012/janitor-confirmation"
  }
}

variables {
  config = {
    prefix             = "test"
    organization       = "example"
    runner_group_ids   = [123]
    runner_name_prefix = "account-prod_"
    regions            = ["eu-west-1", "us-east-1"]
    s3_bucket          = "artifacts"
    s3_key             = "termination-watcher.zip"
    github_app_parameters = {
      id         = { name = "/app/id", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/id" }
      key_base64 = { name = "/app/key", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/key" }
    }
  }
}

run "safe_defaults_and_delayed_confirmation" {
  assert {
    condition     = aws_iam_role_policy.cleanup.policy == data.aws_iam_policy_document.cleanup.json && aws_iam_role_policy.compute.policy == data.aws_iam_policy_document.compute.json
    error_message = "Shared cleanup and compute permissions must attach their respective policy documents."
  }
  assert {
    condition     = alltrue([for s in data.aws_iam_policy_document.cleanup.statement : !contains(s.actions, "ec2:DescribeInstances")]) && one(one(data.aws_iam_policy_document.compute.statement).condition).test == "StringEquals" && one(one(data.aws_iam_policy_document.compute.statement).condition).variable == "aws:RequestedRegion"
    error_message = "EC2 permissions must stay in the separate provider policy with the region restriction."
  }
  assert {
    condition = jsondecode(output.lambda.function.environment[0].variables["REGISTRATION_JANITOR_CONFIG"]).computeProvider == {
      type    = "ec2"
      options = { regions = ["eu-west-1", "us-east-1"] }
    }
    error_message = "The janitor must receive the EC2 provider and its complete region scope."
  }

  assert {
    condition     = !contains(keys(output.lambda.function.environment[0].variables), "PARAMETER_GITHUB_APPS_MANIFEST_NAME")
    error_message = "Single-App deployments must omit the optional environment key."
  }
  command = apply
  assert {
    condition     = one([for s in data.aws_iam_policy_document.cleanup.statement : s.actions if s.sid == "ReadGitHubCredentials"]) == toset(["ssm:GetParameters"])
    error_message = "Credential loading uses the batched GetParameters API."
  }
  assert {
    condition     = output.lambda.function.handler == "index.registrationJanitor" && jsondecode(output.lambda.function.environment[0].variables["REGISTRATION_JANITOR_CONFIG"]).dryRun
    error_message = "The Lambda must invoke the janitor handler in dry-run mode."
  }
  assert {
    condition     = var.config.dry_run && var.config.max_candidates == 100
    error_message = "The janitor must start in dry-run mode with bounded candidate batches."
  }
  assert {
    condition     = aws_sqs_queue.confirmation.delay_seconds == 900 && aws_sqs_queue.confirmation.visibility_timeout_seconds == 1800
    error_message = "Confirmations must be delayed 15 minutes and remain invisible during retries."
  }
  assert {
    condition     = aws_lambda_event_source_mapping.confirmation.function_response_types == toset(["ReportBatchItemFailures"])
    error_message = "Only failed confirmations should be retried."
  }
  assert {
    condition     = one(data.aws_iam_policy_document.compute.statement).actions == toset(["ec2:DescribeInstances"])
    error_message = "The janitor must not be able to terminate instances."
  }
  assert {
    condition     = toset(one(one(data.aws_iam_policy_document.compute.statement).condition).values) == toset(["eu-west-1", "us-east-1"])
    error_message = "EC2 access must be limited to the configured regions."
  }
  assert {
    condition     = length(data.aws_iam_policy_document.cleanup.statement) == 2
    error_message = "KMS access should be absent unless a customer-managed key is configured."
  }
}

run "reject_empty_scope" {
  command = plan
  variables {
    config = {
      prefix             = "test"
      organization       = "example"
      runner_group_ids   = [123]
      runner_name_prefix = ""
      regions            = ["eu-west-1"]
      s3_bucket          = "artifacts"
      s3_key             = "termination-watcher.zip"
      github_app_parameters = {
        id         = { name = "/app/id", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/id" }
        key_base64 = { name = "/app/key", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/key" }
      }
    }
  }
  expect_failures = [var.config]
}

run "customer_managed_key" {
  command = apply
  variables {
    config = {
      github_app_kms_key_arn = "arn:aws:kms:eu-west-1:123456789012:key/11111111-1111-1111-1111-111111111111"
      prefix                 = "test"
      organization           = "example"
      runner_group_ids       = [123]
      runner_name_prefix     = "account-prod_"
      regions                = ["eu-west-1"]
      s3_bucket              = "artifacts"
      s3_key                 = "termination-watcher.zip"
      github_app_parameters = {
        id         = { name = "/app/id", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/id" }
        key_base64 = { name = "/app/key", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/key" }
      }
    }
  }
  assert {
    condition     = one([for s in data.aws_iam_policy_document.cleanup.statement : s.resources if s.sid == "DecryptGitHubCredentials"]) == toset([var.config.github_app_kms_key_arn])
    error_message = "App credential decryption must be limited to the configured KMS key."
  }
}

run "additional_apps_manifest" {
  command = apply
  variables {
    config = {
      prefix             = "test"
      organization       = "example"
      runner_group_ids   = [123]
      runner_name_prefix = "account-prod_"
      regions            = ["eu-west-1"]
      s3_bucket          = "artifacts"
      s3_key             = "termination-watcher.zip"
      github_app_parameters = {
        id                            = { name = "/app/id", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/id" }
        key_base64                    = { name = "/app/key", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/key" }
        additional_apps_manifest      = { name = "/app/manifest", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/manifest" }
        additional_app_parameter_arns = ["arn:aws:ssm:eu-west-1:123456789012:parameter/app/extra/key"]
      }
    }
  }
  assert {
    condition     = output.lambda.function.environment[0].variables["PARAMETER_GITHUB_APPS_MANIFEST_NAME"] == "/app/manifest"
    error_message = "The Lambda must receive the additional Apps manifest."
  }
  assert {
    condition     = one([for s in data.aws_iam_policy_document.cleanup.statement : s.actions if s.sid == "ReadGitHubCredentials"]) == toset(["ssm:GetParameter", "ssm:GetParameters"]) && one([for s in data.aws_iam_policy_document.cleanup.statement : s.resources if s.sid == "ReadGitHubCredentials"]) == toset([var.config.github_app_parameters.id.arn, var.config.github_app_parameters.key_base64.arn, var.config.github_app_parameters.additional_apps_manifest.arn, "arn:aws:ssm:eu-west-1:123456789012:parameter/app/extra/key"])
    error_message = "Read access must cover the manifest and only the configured credential parameters."
  }
}
