locals {
  environment = var.environment != null ? var.environment : "enterprise"
  aws_region  = var.aws_region
}

resource "random_id" "random" {
  byte_length = 20
}

module "base" {
  source = "../base"

  prefix     = local.environment
  aws_region = local.aws_region
}

module "runners" {
  source                          = "../../"
  create_service_linked_role_spot = true
  aws_region                      = local.aws_region
  vpc_id                          = module.base.vpc.vpc_id
  subnet_ids                      = module.base.vpc.private_subnets

  prefix = local.environment
  tags = {
    Project = "Enterprise Runners"
  }

  # Enterprise runners do not require a GitHub App.
  # Only the webhook_secret is needed to verify incoming webhook payloads.
  github_app = {
    webhook_secret = random_id.random.hex
  }

  # Enterprise runner registration level
  runner_registration_level = "enterprise"
  enterprise_slug           = var.enterprise_slug

  # Enterprise PAT for authentication
  enterprise_pat = {
    pat = var.enterprise_pat
  }

  # Runner labels
  runner_extra_labels = ["enterprise", "example"]

  # enable access to the runners via SSM
  enable_ssm_on_runners = true

  instance_types = ["m7a.large", "m5.large"]

  # override delay of events in seconds
  delay_webhook_event   = 5
  runners_maximum_count = 5

  # override scaling down
  scale_down_schedule_expression = "cron(* * * * ? *)"

  enable_user_data_debug_logging_runner = true
}

