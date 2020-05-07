output "action_runners" {
  value = {
    runners = module.runners.runners
  }
}


output "lambda_binaries_syncer_name" {
  value = module.runners.binaries_syncer.lambda.id
}


output "github_app_webhook_secret" {
  value = random_password.random.result
}


