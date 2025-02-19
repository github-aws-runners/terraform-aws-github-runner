output "runners" {
  value = {
    lambda_syncer_name = module.runners.binaries_syncer.lambda.function_name
  }
}

output "webhook_endpoint" {
  value = module.runners.webhook.endpoint
}

output "note" {
  value = <<-EOF
    The runners are not yet ready to process jobs. Please ensure you updated the GitHub app with the webhook endpoint and secret.
    The webhook endpoint is: ${module.runners.webhook.endpoint}
  EOF
}
