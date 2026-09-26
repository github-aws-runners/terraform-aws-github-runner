aws_region  = "eu-west-1"
environment = "multi-runner-webhook"

runners_lambda_zip = "../../lambdas/functions/control-plane/runners.zip"
webhook_lambda_zip = "../../lambdas/functions/webhook/webhook.zip"

github = {
  url                = "https://host.docker.internal:1080"
  ssl_verify         = false
  runner_owner       = "example"
  registration_level = "organization"
}

scale_set = {
  name              = "linux-scale-set"
  runner_group_name = "experimental-euw1-sl-cicd-forge-emu"
  min_runners       = 1
  container = {
    image = "MINISTACK_SCALE_SET_IMAGE"
  }
}

github_app = {
  id              = "123"
  installation_id = "123"
  key_base64      = "ministack-invalid-key"
  webhook_secret  = "ministack-webhook-secret"
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
