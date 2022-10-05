output "multi-runner-output" {
  value = {
    "webhook_endpoint" : module.multi-runner.webhook.endpoint
    "webhook_secret" : random_id.random.hex
  }
}