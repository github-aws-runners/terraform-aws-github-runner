mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/runner-test"
    }
  }

  mock_resource "aws_iam_policy" {
    defaults = {
      arn = "arn:aws:iam::123456789012:policy/runner-test"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn = "arn:aws:lambda:eu-west-1:123456789012:function:runner-test"
    }
  }

  mock_resource "aws_sqs_queue" {
    defaults = {
      arn = "arn:aws:sqs:eu-west-1:123456789012:runner-test"
      id  = "https://sqs.eu-west-1.amazonaws.com/123456789012/runner-test"
      url = "https://sqs.eu-west-1.amazonaws.com/123456789012/runner-test"
    }
  }

  mock_resource "aws_cloudwatch_event_rule" {
    defaults = {
      arn = "arn:aws:events:eu-west-1:123456789012:rule/runner-test"
    }
  }
}

run "computed_external_values_keep_plan_shape_known" {
  command = plan

  module {
    source = "./tests/fixtures/computed-iam-inputs"
  }

  # The packaged runner archive is added by the release build, so the computed
  # IAM fixture isolates the two common housekeeper children in a source checkout.
  override_module {
    target = module.external_iam.module.runner_config_housekeeper
  }

  override_module {
    target = module.generated_policy.module.runner_config_housekeeper
  }

  assert {
    condition     = output.external_role_runner_count == 0
    error_message = "Computed external AMI parameter, KMS key, role, and profile values must not make resource or policy-block counts unknown."
  }

  assert {
    condition     = output.generated_policy_role_runner_count == 1
    error_message = "A computed managed-policy ARN under a caller-known map key must keep attachment planning stable."
  }

}
