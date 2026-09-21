output "webhook_endpoint" {
  value = module.runners.webhook.endpoint
}
output "webhook_secret" {
  sensitive = true
  value     = var.github_app.webhook_secret
}
