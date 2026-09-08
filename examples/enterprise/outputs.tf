output "runners" {
  value = {
    lambda_syncer_name = module.runners.binaries_syncer.lambda.function_name
  }
}

output "webhook_endpoint" {
  value = module.runners.webhook.endpoint
}

output "webhook_secret" {
  sensitive = true
  value     = random_id.random.hex
}

