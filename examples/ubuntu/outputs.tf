output "runners" {
  value = {
    lambda_syncer_name = module.runners.binaries_syncer.lambda.function_name
  }
}

output "webhook" {
  value = {
    secret   = random_id.random.hex
    endpoint = module.runners.webhook.endpoint
  }
}
