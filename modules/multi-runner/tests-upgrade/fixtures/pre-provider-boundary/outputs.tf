output "runner_state" {
  description = "Stable resource identities captured before the EC2 provider boundary."
  value = {
    launch_template_id = module.runners["linux"].launch_template.id
    lambda_up_id       = module.runners["linux"].lambda_scale_up.id
    lambda_pool_id     = module.runners["linux"].lambda_pool.id
    role_runner_id     = module.runners["linux"].role_runner[0].id
  }
}
