output "runners_map" {
  description = "EC2 runner resources keyed by the stable multi-runner lane name."
  value = { for runner_key, runner in module.runners : runner_key => {
    launch_template_name    = runner.launch_template.name
    launch_template_id      = runner.launch_template.id
    launch_template_version = runner.launch_template.latest_version
    launch_template_ami_id  = runner.launch_template.image_id
    lambda_up               = runner.lambda_scale_up
    lambda_up_log_group     = runner.lambda_scale_up_log_group
    lambda_down             = runner.lambda_scale_down
    lambda_down_log_group   = runner.lambda_scale_down_log_group
    lambda_pool             = runner.lambda_pool
    lambda_pool_log_group   = runner.lambda_pool_log_group
    role_runner             = runner.role_runner
    role_scale_up           = runner.role_scale_up
    role_scale_down         = runner.role_scale_down
    role_pool               = runner.role_pool
    runners_log_groups      = runner.runners_log_groups
    logfiles                = runner.logfiles
    }
  }
}
