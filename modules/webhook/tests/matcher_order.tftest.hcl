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
  prefix = "test"

  # Reference the zip via S3 so the plan does not need a local file on disk.
  lambda_s3_bucket      = "test-bucket"
  webhook_lambda_s3_key = "webhook.zip"

  storage_provider = {
    aws = {
      ssm = {
        paths = {
          root    = "/test"
          webhook = "webhook"
        }
      }
    }
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
    loose_zero = {
      arn = "arn:aws:sqs:eu-west-1:123456789012:loose-zero"
      id  = "loose-zero"
      matcherConfig = {
        labelMatchers = [["self-hosted"]]
        exactMatch    = false
        priority      = 0
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
      "loose-zero",
      "loose-low",
      "loose-default",
    ]
    error_message = "Matchers must be ordered strict first, then by ascending priority. Got: ${jsonencode([for c in local.runner_matcher_config_sorted : c.id])}"
  }
}

# The %03d pad only matches numeric order for priorities inside 0-999. Outside it,
# 1000 would sort ahead of 999 by its leading digit and -1 would sort ahead of
# everything, so the range has to be enforced rather than assumed.
run "priority_above_the_range_is_rejected" {
  command = plan

  variables {
    runner_matcher_config = {
      wide = {
        arn = "arn:aws:sqs:eu-west-1:123456789012:wide"
        id  = "wide"
        matcherConfig = {
          labelMatchers = [["self-hosted"]]
          exactMatch    = false
          priority      = 1000
        }
      }
    }
  }

  expect_failures = [var.runner_matcher_config]
}

run "priority_below_the_range_is_rejected" {
  command = plan

  variables {
    runner_matcher_config = {
      negative = {
        arn = "arn:aws:sqs:eu-west-1:123456789012:negative"
        id  = "negative"
        matcherConfig = {
          labelMatchers = [["self-hosted"]]
          exactMatch    = false
          priority      = -1
        }
      }
    }
  }

  expect_failures = [var.runner_matcher_config]
}
