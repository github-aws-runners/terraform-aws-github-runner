locals {
  webhook_secret = random_id.random.hex

  multi_runner_config = { for c in fileset("${path.module}/templates/runner-configs", "*.yaml") : trimsuffix(c, ".yaml") => yamldecode(file("${path.module}/templates/runner-configs/${c}")) }
}

resource "random_id" "random" {
  byte_length = 20
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.0.0"

  name = "${var.environment}-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["${var.aws_region}a", "${var.aws_region}b"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]

  enable_dns_hostnames    = true
  enable_nat_gateway      = false
  map_public_ip_on_launch = true

  tags = {
    Environment = var.environment
  }
}

module "dynamodb" {
  source = "../../modules/dynamodb"

  table_name   = "${var.environment}-runner-config"
  billing_mode = "PAY_PER_REQUEST"
  tags = {
    Environment = var.environment
  }
}

module "runners" {
  source                            = "../../modules/multi-runner"
  aws_region                        = var.aws_region
  multi_runner_config               = local.multi_runner_config
  vpc_id                            = module.vpc.vpc_id
  subnet_ids                        = module.vpc.public_subnets
  runners_scale_up_lambda_timeout   = 60
  runners_scale_down_lambda_timeout = 60
  cleanup_org_runners               = var.cleanup_org_runners
  prefix                            = var.environment
  dynamodb_arn                      = module.dynamodb.table_arn
  dynamodb_table_name               = module.dynamodb.table_name
  tags = {
    Environment = var.environment
  }
  github_app = {
    key_base64     = var.github_app.key_base64
    id             = var.github_app.id
    webhook_secret = random_id.random.hex
  }

  logging_retention_in_days = 7

  # Deploy webhook using the EventBridge
  eventbridge = {
    enable = true
    # adjust the allow events to only allow specific events, like workflow_job
    accept_events = ["workflow_job"]
  }

  webhook_lambda_zip = "../../lambda_output/webhook.zip"
  runners_lambda_zip = "../../lambda_output/runners.zip"

  instance_termination_watcher = {
    enable = true
  }

  runners_ssm_housekeeper = {
    state  = "DISABLED"
    config = {}
  }

  metrics = {
    enable = true
    metric = {
      enable_github_app_rate_limit    = true
      enable_job_retry                = true
      enable_spot_termination_warning = true
    }
  }
}

module "webhook_github_app" {
  source     = "../../modules/webhook-github-app"
  depends_on = [module.runners]

  github_app = {
    key_base64     = var.github_app.key_base64
    id             = var.github_app.id
    webhook_secret = local.webhook_secret
  }
  webhook_endpoint = module.runners.webhook.endpoint
}
