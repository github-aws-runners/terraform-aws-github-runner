locals {
  environment = var.environment != null ? var.environment : "default"
  aws_region  = var.aws_region
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
    Project = "ProjectX"
  }

  github_app = {
    key_base64_ssm     = var.github_app_ssm_parameters.key_base64
    id_ssm             = var.github_app_ssm_parameters.id
    webhook_secret_ssm = var.github_app_ssm_parameters.webhook_secret
  }

  enable_organization_runners = true
  runner_extra_labels         = ["default", "example"]

  # enable access to the runners via SSM
  enable_ssm_on_runners = true

  instance_types = ["m7a.large", "m5.large"]

  # override delay of events in seconds
  delay_webhook_event   = 5
  runners_maximum_count = 2

  # override scaling down
  scale_down_schedule_expression = "cron(* * * * ? *)"

  # prefix GitHub runners with the environment name
  runner_name_prefix = "${local.environment}_"
}
