output "runners" {
  value = {
    launch_template_name       = module.runners.launch_template.name
    launch_template_id         = module.runners.launch_template.id
    launch_template_version    = module.runners.launch_template.latest_version
    action_runner_distribution = module.dsitrubtion_cache.s3_location_runner_distribution
  }
}


output "lambda_s3_action_runner_dist_syncer" {
  value = moudle.dsitrubtion_cache.lambda_s3_action_runner_dist_syncer
}
