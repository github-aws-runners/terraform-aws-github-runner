resource "aws_lambda_function" "syncer" {
  filename         = "${path.module}/lambdas/syncer/syncer.zip"
  source_code_hash = filebase64sha256("${path.module}/lambdas/syncer/syncer.zip")
  function_name    = "${var.environment}-syncer"
  role             = aws_iam_role.syncer_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs12.x"
  timeout          = 300

  environment {
    variables = {
      LOG_LEVEL      = "info"
      S3_BUCKET_NAME = aws_s3_bucket.action_dist.id
      S3_OBJECT_KEY  = local.action_runner_distribution_object_key
    }
  }

  tags = var.tags
}

resource "aws_iam_role" "syncer_lambda" {
  name               = "${var.environment}-action-syncer-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role_policy.json
  tags               = var.tags
}

data "aws_iam_policy_document" "lambda_assume_role_policy" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_policy" "lambda_logging" {
  name        = "${var.environment}-lamda-logging-policy-syncer"
  description = "Lambda logging policy"

  policy = templatefile("${path.module}/policies/lambda-cloudwatch.json", {})
}


resource "aws_iam_policy_attachment" "syncer_logging" {
  name       = "${var.environment}-logging"
  roles      = [aws_iam_role.syncer_lambda.name]
  policy_arn = aws_iam_policy.lambda_logging.arn
}

resource "aws_iam_policy" "syncer" {
  name        = "${var.environment}-lamda-syncer-s3-policy"
  description = "Lambda syncer policy"

  policy = templatefile("${path.module}/policies/lambda-syncer.json", {
    s3_resource_arn = "${aws_s3_bucket.action_dist.arn}/${local.action_runner_distribution_object_key}"
  })
}

resource "aws_iam_policy_attachment" "syncer" {
  name       = "${var.environment}-syncer"
  roles      = [aws_iam_role.syncer_lambda.name]
  policy_arn = aws_iam_policy.syncer.arn
}

resource "aws_cloudwatch_event_rule" "syncer" {
  schedule_expression = var.lambda_schedule_expression
  tags                = var.tags
}

resource "aws_cloudwatch_event_target" "syncer" {
  rule = aws_cloudwatch_event_rule.syncer.name
  arn  = aws_lambda_function.syncer.arn
}

resource "aws_lambda_permission" "allow_cloudwatch_to_call_check_foo" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.syncer.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.syncer.arn
}

