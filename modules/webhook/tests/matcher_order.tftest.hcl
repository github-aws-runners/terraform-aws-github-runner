# The dispatcher consumes runner_matcher_config_sorted as-is and does no sorting
# of its own, so the ordering guarantee lives here.

mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }
}

variables {
  prefix     = "test"
  aws_region = "eu-west-1"

  # Reference the zip via S3 so the plan does not need a local file on disk.
  lambda_s3_bucket      = "test-bucket"
  webhook_lambda_s3_key = "webhook.zip"

  sqs_workflow_job_queue = {
    arn  = "arn:aws:sqs:eu-west-1:123456789012:workflow-job"
    id   = "https://sqs.eu-west-1.amazonaws.com/123456789012/workflow-job"
    url  = "https://sqs.eu-west-1.amazonaws.com/123456789012/workflow-job"
    name = "workflow-job"
  }

  ssm_paths = {
    root    = "/test"
    webhook = "webhook"
  }

  eventbridge = {
    enable = false
  }

  github_app_parameters = {
    webhook_secret = {
      name = "/test/webhook_secret"
      arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/test/webhook_secret"
    }
  }

  runner_matcher_config = {
    loose_low = {
      arn = "arn:aws:sqs:eu-west-1:123456789012:loose-low"
      id  = "loose-low"
      matcherConfig = {
        labelMatchers = [["self-hosted"]]
        exactMatch    = false
        priority      = 1
      }
    }
    loose_default = {
      arn = "arn:aws:sqs:eu-west-1:123456789012:loose-default"
      id  = "loose-default"
      matcherConfig = {
        labelMatchers = [["self-hosted"]]
        exactMatch    = false
      }
    }
    # Deliberately wider than the historical 0-999 range: it must still sort after
    # 999 by magnitude, not ahead of it by leading digit.
    loose_wide = {
      arn = "arn:aws:sqs:eu-west-1:123456789012:loose-wide"
      id  = "loose-wide"
      matcherConfig = {
        labelMatchers = [["self-hosted"]]
        exactMatch    = false
        priority      = 1000
      }
    }
    exact_high = {
      arn = "arn:aws:sqs:eu-west-1:123456789012:exact-high"
      id  = "exact-high"
      matcherConfig = {
        labelMatchers = [["self-hosted", "exact"]]
        exactMatch    = true
        priority      = 500
      }
    }
    bidirectional_low = {
      arn = "arn:aws:sqs:eu-west-1:123456789012:bidirectional-low"
      id  = "bidirectional-low"
      matcherConfig = {
        labelMatchers           = [["self-hosted", "bidi"]]
        exactMatch              = false
        bidirectionalLabelMatch = true
        priority                = 5
      }
    }
  }
}

run "strict_matchers_are_ordered_ahead_of_loose_ones" {
  command = plan

  assert {
    condition = [for c in local.runner_matcher_config_sorted : c.id] == [
      "bidirectional-low",
      "exact-high",
      "loose-low",
      "loose-default",
      "loose-wide",
    ]
    error_message = "Matchers must be ordered strict first, then by ascending priority. Got: ${jsonencode([for c in local.runner_matcher_config_sorted : c.id])}"
  }
}

run "priority_beyond_three_digits_sorts_by_magnitude" {
  command = plan

  # Guards the zero-padding width: too narrow a pad sorts 1000 ahead of 999
  # because '1' < '9' lexicographically.
  assert {
    condition     = index([for c in local.runner_matcher_config_sorted : c.id], "loose-wide") > index([for c in local.runner_matcher_config_sorted : c.id], "loose-default")
    error_message = "priority 1000 must sort after the 999 default, not ahead of it."
  }
}
