locals {
  tags = merge(var.tags, {
    Environment = var.environment
  })

  s3_action_runner_url = "s3://${module.runner_binaries.bucket.id}/${module.runner_binaries.runner_distribution_object_key}"
}

resource "random_string" "random" {
  length  = 24
  special = false
  upper   = false
}

resource "aws_sqs_queue" "queued_builds" {
  name                        = "${var.environment}-queued-builds.fifo"
  delay_seconds               = 30
  fifo_queue                  = true
  receive_wait_time_seconds   = 10
  content_based_deduplication = true

  tags = var.tags
}

module "webhook" {
  source = "./modules/webhook"

  aws_region  = var.aws_region
  environment = var.environment
  tags        = local.tags

  sqs_build_queue           = aws_sqs_queue.queued_builds
  github_app_webhook_secret = var.github_app_webhook_secret
}

module "runners" {
  source = "./modules/runners"

  aws_region  = var.aws_region
  vpc_id      = var.vpc_id
  environment = var.environment
  tags        = local.tags

  s3_bucket_runner_binaries   = module.runner_binaries.bucket
  s3_location_runner_binaries = local.s3_action_runner_url
}

module "runner_binaries" {
  source = "./modules/runner-binaries-syncer"

  aws_region  = var.aws_region
  environment = var.environment
  tags        = local.tags

  distribution_bucket_name = "${var.environment}-dist-${random_string.random.result}"
}

resource "aws_resourcegroups_group" "resourcegroups_group" {
  name = "${var.environment}-group"

  resource_query {
    query = <<-JSON
{
  "ResourceTypeFilters": [
    "AWS::AllSupported"
  ],
  "TagFilters": [
    {
      "Key": "Environment",
      "Values": ["${var.environment}"]
    }
  ]
}
  JSON
  }
}
