output "webhook_endpoint" {
  value = module.multi-runner.webhook.endpoint
}

output "webhook_secret" {
  sensitive = true
  value     = random_id.random.hex
}
