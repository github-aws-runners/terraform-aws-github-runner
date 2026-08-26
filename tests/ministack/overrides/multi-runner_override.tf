variable "environment" {
  default = "ministack"
}

variable "github_app" {
  default = {
    id         = "0"
    key_base64 = "ministack-invalid-key"
  }
}

locals {
  # The production example consumes this override after it is copied into the
  # example root; it is intentionally unused in this standalone fixture folder.
  # tflint-ignore: terraform_unused_declarations
  multi_runner_config = {
    for name, config in local.multi_runner_config_files : name => merge(config, {
      runner_config = merge(config.runner_config, {
        ami = contains(keys(config.runner_config), "ami") ? merge(local.ministack_ami, {
          id_ssm_parameter_arn = lookup(local.ssm_ami_arns, name, null)
        }) : null
        subnet_ids = lookup(config.runner_config, "subnet_ids", null) != null ? [module.base.vpc.private_subnets[0]] : null
        vpc_id     = lookup(config.runner_config, "vpc_id", null) != null ? module.base.vpc.vpc_id : null
      })
    })
  }
}

module "runners" {
  runner_binaries_syncer_lambda_zip = var.ministack_lambda_archive
  runners_lambda_zip                = var.ministack_lambda_archive
  webhook_lambda_zip                = var.ministack_lambda_archive
}

# The production example updates GitHub through a local-exec provisioner.
# A zero count structurally prevents any external GitHub API call in this test.
module "webhook_github_app" {
  count = 0
}
