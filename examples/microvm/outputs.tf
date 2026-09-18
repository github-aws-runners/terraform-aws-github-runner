output "webhook_endpoint" {
  description = "Webhook endpoint to configure on the GitHub App."
  value       = module.runners.webhook.endpoint
}

output "microvm_image_arn" {
  description = "The MicroVM image ARN consumed by this runner configuration."
  value       = var.microvm_image_arn
}
