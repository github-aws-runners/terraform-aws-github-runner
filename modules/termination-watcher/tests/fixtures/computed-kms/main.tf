resource "terraform_data" "kms" {
  input = "arn:aws:kms:eu-west-1:123456789012:key/22222222-2222-2222-2222-222222222222"
}

module "subject" {
  source = "../../.."

  config = {
    prefix                       = "test"
    s3_bucket                    = "artifacts"
    s3_key                       = "termination-watcher.zip"
    runtime                      = "nodejs24.x"
    timeout                      = 60
    memory_size                  = 256
    architecture                 = "arm64"
    tag_filters                  = { "ghr:environment" = "test" }
    enable_runner_deregistration = true
    github_app_kms_key_arn       = terraform_data.kms.output
    github_app_parameters = {
      id         = { name = "/app/id", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/id" }
      key_base64 = { name = "/app/key", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/key" }
    }
  }
}

output "deregistration_enabled" {
  value = module.subject.deregister_retry != null
}
