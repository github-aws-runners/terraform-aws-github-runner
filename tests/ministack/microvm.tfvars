
aws_region  = "eu-west-1"
environment = "microvm-ministack"

github_app = {
  id         = "your-github-app-id"
  key_base64 = "your-github-app-key-base64"
}

lambda_artifact_bucket       = "github-actions-runner-microvm-ministack"
microvm_image_arn            = "arn:aws:lambda:eu-west-1:000000000000:microvm-image:ministack"
egress_network_connector_arn = "arn:aws:lambda:eu-west-1:000000000000:network-connector:ministack"
