output "action_runners" {
  value = {
    runners = module.runners.runners
  }
}


output "lambda_syncer_function_name" {
  value = module.runners.lambda_s3_action_runner_dist_syncer.id
}


output "github_app_webhook_secret" {
  value = random_password.random.result
}
