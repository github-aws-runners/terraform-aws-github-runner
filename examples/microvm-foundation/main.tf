locals {
  environment = "microvm-foundation"
  aws_region  = var.aws_region

  network_connectors = {
    ministack = {
      name       = "ministack"
      vpc_id     = module.base.vpc.vpc_id
      subnet_ids = module.base.vpc.private_subnets
    }
  }
}

module "base" {
  source = "../base"

  prefix     = local.environment
  aws_region = local.aws_region
}

module "microvm_foundation" {
  source = "../../modules/microvm-foundation"

  aws_region                                  = local.aws_region
  tags                                        = var.tags
  build_policy_name_prefix                    = var.build_policy_name_prefix
  build_role_name_prefix                      = var.build_role_name_prefix
  network_connector_operator_role_name_prefix = var.network_connector_operator_role_name_prefix
  usage_policy_name_prefix                    = var.usage_policy_name_prefix
  artifact_bucket_name                        = var.artifact_bucket_name
  artifact_retention_days                     = var.artifact_retention_days
  image_name_prefix                           = var.image_name_prefix
  ecr_repository_arns                         = var.ecr_repository_arns
  network_connectors                          = local.network_connectors
}
