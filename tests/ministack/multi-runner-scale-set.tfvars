environment = "ministack-multi-runner-scale-set"
aws_region  = "eu-west-1"

github_app = {
  id         = "0"
  key_base64 = "ministack-invalid-key"
}

scale_set = {
  config_url = "https://github.com/example"
  installation_id_ssm = {
    name = "/ministack/scale-set/installation-id"
    arn  = "arn:aws:ssm:eu-west-1:000000000000:parameter/ministack/scale-set/installation-id"
  }
  name            = "ministack-scale-set"
  id              = 1
  runner_group_id = 1
}
