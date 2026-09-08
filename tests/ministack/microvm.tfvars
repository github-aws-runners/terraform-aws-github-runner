aws_region  = "eu-west-1"
environment = "microvm-ministack"

github_app = {
  key_base64_ssm = {
    name = "/ministack/microvm/github-app-key"
    arn  = "arn:aws:ssm:eu-west-1:000000000000:parameter/ministack/microvm/github-app-key"
  }
  id_ssm = {
    name = "/ministack/microvm/github-app-id"
    arn  = "arn:aws:ssm:eu-west-1:000000000000:parameter/ministack/microvm/github-app-id"
  }
  webhook_secret_ssm = {
    name = "/ministack/microvm/webhook-secret"
    arn  = "arn:aws:ssm:eu-west-1:000000000000:parameter/ministack/microvm/webhook-secret"
  }
}

lambda_artifact_bucket       = "github-actions-runner-microvm-ministack"
microvm_image_arn            = "arn:aws:lambda:eu-west-1:000000000000:microvm-image:ministack"
egress_network_connector_arn = "arn:aws:lambda:eu-west-1:000000000000:network-connector:ministack"
