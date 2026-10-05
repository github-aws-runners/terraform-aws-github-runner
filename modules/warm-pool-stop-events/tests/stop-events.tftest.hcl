mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }

  mock_resource "aws_cloudwatch_event_rule" {
    defaults = {
      arn = "arn:aws:events:eu-west-1:123456789012:rule/test-warm-pool-stopped"
    }
  }

  mock_resource "aws_sqs_queue" {
    defaults = {
      arn = "arn:aws:sqs:eu-west-1:123456789012:test-warm-pool-stop-events"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn = "arn:aws:lambda:eu-west-1:123456789012:function:test-warm-pool-stop-events"
    }
  }
}

variables {
  config = {
    prefix = "test"
    tags   = { Environment = "test" }
    index_tables = {
      test-a = { name = "test-a-warm-pool-index", arn = "arn:aws:dynamodb:eu-west-1:123456789012:table/test-a-warm-pool-index" }
      test-b = { name = "test-b-warm-pool-index", arn = "arn:aws:dynamodb:eu-west-1:123456789012:table/test-b-warm-pool-index" }
    }
    # S3 avoids hashing a local archive during plan.
    lambda = {
      s3_bucket = "lambda-bucket"
      s3_key    = "runners.zip"
    }
  }
}

run "one_rule_queue_and_consumer" {
  command = plan

  assert {
    condition = (
      jsondecode(aws_cloudwatch_event_rule.instance_stopped.event_pattern).source == ["aws.ec2"]
      && jsondecode(aws_cloudwatch_event_rule.instance_stopped.event_pattern)["detail-type"] == ["EC2 Instance State-change Notification"]
      && jsondecode(aws_cloudwatch_event_rule.instance_stopped.event_pattern).detail.state == ["stopped"]
    )
    error_message = "The rule must match EC2 stop events only."
  }

  assert {
    condition = (
      aws_sqs_queue.stop_events.sqs_managed_sse_enabled
      && aws_sqs_queue.stop_events.message_retention_seconds == 3600
      && aws_sqs_queue.stop_events.visibility_timeout_seconds == 180
    )
    error_message = "The queue must be encrypted, keep events briefly, and outlast the consumer timeout."
  }

  assert {
    condition = (
      aws_lambda_event_source_mapping.stop_events.batch_size == 100
      && aws_lambda_event_source_mapping.stop_events.maximum_batching_window_in_seconds == 5
      && contains(aws_lambda_event_source_mapping.stop_events.function_response_types, "ReportBatchItemFailures")
    )
    error_message = "The consumer must read batches and report partial failures."
  }

  assert {
    condition = (
      module.consumer.lambda.function.handler == "index.warmPoolStopEvents"
      && jsondecode(module.consumer.lambda.function.environment[0].variables["WARM_POOL_INDEX_TABLES"]) == {
        test-a = "test-a-warm-pool-index"
        test-b = "test-b-warm-pool-index"
      }
    )
    error_message = "The consumer must receive the index table of every warm environment."
  }

  assert {
    condition = (
      one([for statement in data.aws_iam_policy_document.consumer.statement : statement.resources if statement.sid == "MarkPrimedInstancesWarm"]) == toset([
        "arn:aws:dynamodb:eu-west-1:123456789012:table/test-a-warm-pool-index",
        "arn:aws:dynamodb:eu-west-1:123456789012:table/test-b-warm-pool-index",
      ])
      && one([for statement in data.aws_iam_policy_document.consumer.statement : statement.actions if statement.sid == "MarkPrimedInstancesWarm"]) == toset(["dynamodb:UpdateItem"])
    )
    error_message = "The consumer may only update the mapped index tables."
  }

  assert {
    condition     = one(data.aws_iam_policy_document.stop_events_queue.statement[0].condition[*].variable) == "aws:SourceArn"
    error_message = "Only the stop rule may send to the queue."
  }
}

run "uses_the_control_plane_archive_from_s3" {
  command = plan

  assert {
    condition = (
      module.consumer.lambda.function.s3_bucket == "lambda-bucket"
      && module.consumer.lambda.function.s3_key == "runners.zip"
      && module.consumer.lambda.function.filename == null
    )
    error_message = "The consumer must run the control-plane archive selected for the runners."
  }
}

run "requires_an_index_table" {
  command = plan

  variables {
    config = merge(var.config, { index_tables = {} })
  }

  expect_failures = [var.config]
}
