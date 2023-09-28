resource "null_resource" "update_app" {
  triggers = {
    webhook_endpoint = var.webhook_endpoint
    webhook_secret   = var.github_app.webhook_secret
  }

  provisioner "local-exec" {
    interpreter = ["bash", "-c"]
    command     = "${path.module}/bin/update-app.sh -we ${var.webhook_endpoint} -ws ${var.github_app.webhook_secret} -a ${var.github_app.id} -k ${var.github_app.key_base64}"
    on_failure  = continue
  }
}
