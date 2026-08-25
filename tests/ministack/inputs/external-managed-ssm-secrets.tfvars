environment = "ministack-external-ssm"
github_app_ssm_parameters = {
  id = {
    arn  = "arn:aws:ssm:eu-west-1:000000000000:parameter/ministack/terraform-aws-github-runner/github-app/id"
    name = "/ministack/terraform-aws-github-runner/github-app/id"
  }
  key_base64 = {
    arn  = "arn:aws:ssm:eu-west-1:000000000000:parameter/ministack/terraform-aws-github-runner/github-app/key-base64"
    name = "/ministack/terraform-aws-github-runner/github-app/key-base64"
  }
  webhook_secret = {
    arn  = "arn:aws:ssm:eu-west-1:000000000000:parameter/ministack/terraform-aws-github-runner/github-app/webhook-secret"
    name = "/ministack/terraform-aws-github-runner/github-app/webhook-secret"
  }
}
ami = {
  filter = {
    name  = ["amzn2-ami-hvm-2.0.20231116.0-x86_64-gp2"]
    state = ["available"]
  }
  owners = ["self"]
}
aws_s3_use_path_style = true
