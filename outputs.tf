output "runners" {
  value = {
    launch_template_name    = module.runners.launch_template.name
    launch_template_id      = module.runners.launch_template.id
    launch_template_version = module.runners.launch_template.latest_version
    lambda_up               = module.runners.lambda_scale_up
    lambda_down             = module.runners.lambda_scale_down
    role_runner             = module.runners.role_runner
    role_scale_up           = module.runners.role_scale_up
    role_scale_down         = module.runners.role_scale_down
  }
}

output "binaries_syncer" {
  value = {
    lambda      = module.runner_binaries.lambda
    lambda_role = module.runner_binaries.lambda_role
    location    = local.s3_action_runner_url
  }
}