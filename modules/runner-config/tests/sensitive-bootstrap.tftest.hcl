mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/runner-test"
    }
  }

  mock_resource "aws_ssm_parameter" {
    defaults = {
      arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/ami-id"
    }
  }

  mock_resource "aws_iam_policy" {
    defaults = {
      arn = "arn:aws:iam::123456789012:policy/mock-policy"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn = "arn:aws:lambda:eu-west-1:123456789012:function:mock-function"
    }
  }

  mock_resource "aws_sqs_queue" {
    defaults = {
      arn = "arn:aws:sqs:eu-west-1:123456789012:mock-queue"
    }
  }

  mock_resource "aws_cloudwatch_event_rule" {
    defaults = {
      arn = "arn:aws:events:eu-west-1:123456789012:rule/mock-event-rule"
    }
  }

}

run "sensitive_content_plans" {
  command = plan

  module {
    source = "./tests/fixtures/sensitive-bootstrap"
  }

  override_module {
    target = module.runner.module.ssm_housekeeper
  }

  variables {
    user_data = {
      content = "#!/bin/bash\necho secret-bootstrap-value > /etc/example-token"
    }
  }

  assert {
    condition     = output.user_data_sensitive && output.provider_type == "ec2"
    error_message = "Sensitive bootstrap content must remain sensitive without preventing IAM resource planning."
  }
}

run "sensitive_pre_install_plans" {
  command = plan

  module {
    source = "./tests/fixtures/sensitive-bootstrap"
  }

  override_module {
    target = module.runner.module.ssm_housekeeper
  }

  variables {
    user_data = {
      pre_install = "#!/bin/bash\necho secret-bootstrap-value > /etc/example-token"
    }
  }

  assert {
    condition     = output.user_data_sensitive && output.provider_type == "ec2"
    error_message = "Sensitive bootstrap content must remain sensitive without preventing IAM resource planning."
  }
}

run "sensitive_post_install_plans" {
  command = plan

  module {
    source = "./tests/fixtures/sensitive-bootstrap"
  }

  override_module {
    target = module.runner.module.ssm_housekeeper
  }

  variables {
    user_data = {
      post_install = "#!/bin/bash\necho secret-bootstrap-value > /etc/example-token"
    }
  }

  assert {
    condition     = output.user_data_sensitive && output.provider_type == "ec2"
    error_message = "Sensitive bootstrap content must remain sensitive without preventing IAM resource planning."
  }
}

