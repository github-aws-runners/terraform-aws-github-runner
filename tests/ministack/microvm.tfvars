
aws_region  = "eu-west-1"
environment = "microvm-ministack"

github_app = {
  id             = "2"
  key_base64     = "ministack-invalid-key"
  webhook_secret = "ministack-invalid-webhook-secret"
}

lambda_artifact_bucket       = "github-actions-runner-microvm-ministack"
microvm_image_arn            = "arn:aws:lambda:eu-west-1:000000000000:microvm-image:ministack"
egress_network_connector_arn = "arn:aws:lambda:eu-west-1:000000000000:network-connector:ministack"
