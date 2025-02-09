locals {
  name       = "${var.config.prefix}-runners"
  lambda_zip = var.config.lambda_zip == null ? "${path.module}/../../../lambdas/functions/webhook/webhook.zip" : var.config.lambda_zip
}

resource "aws_cloudwatch_event_bus" "main" {
  name = local.name
  tags = var.config.tags
}

resource "aws_cloudwatch_event_archive" "main" {
  name             = "${local.name}-archive"
  event_source_arn = aws_cloudwatch_event_bus.main.arn
  retention_days   = var.config.archive.retention_days
}
