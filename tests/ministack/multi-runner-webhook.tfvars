aws_region  = "eu-west-1"
environment = "multi-runner-webhook"

runners_lambda_zip = "../../lambda_output/runners.zip"
webhook_lambda_zip = "../../lambda_output/webhook.zip"

github_app = {
  id             = "123"
  key_base64     = "ministack-invalid-key"
  webhook_secret = "ministack-webhook-secret"
}

compute_provider = {
  aws = {
    ec2 = {
      instance_types = ["m7a.large", "m5.large"]
      ami = {
        filter = {
          name  = ["ministack-webhook-linux-x64"]
          state = ["available"]
        }
        owners = ["self"]
      }
    }
    microvm = {
      image_arn                  = "arn:aws:lambda:eu-west-1:000000000000:microvm-image:ministack"
      image_version              = "3.0"
      egress_network_connectors  = ["arn:aws:lambda:eu-west-1:000000000000:network-connector:ministack"]
      ingress_network_connectors = []
    }
  }
}
