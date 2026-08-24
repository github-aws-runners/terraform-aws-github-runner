provider "aws" {
  region = "eu-west-1"

  access_key = "000000000000"
  secret_key = "test-only"

  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true
}

run "setup_lambda_archive" {
  command = apply

  module {
    source = "./tests/setup"
  }

  assert {
    condition     = endswith(output.lambda_archive, ".terraform/ministack/lambda.zip")
    error_message = "The test setup should create its inert Lambda archive in the Terraform cache."
  }
}

run "apply_default_example" {
  command = apply

  override_module {
    target = module.webhook_github_app
  }

  override_data {
    target = module.runners.module.runners.data.aws_ami.runner
    values = {
      id               = "ami-00000000000000000"
      name             = "al2023-ami-ministack-test"
      creation_date    = "2026-08-24T00:00:00.000Z"
      deprecation_time = ""
    }
  }

  variables {
    environment = "ministack"
    github_app = {
      id         = "0"
      key_base64 = "bWluaXN0YWNrLWludmFsaWQtZ2l0aHViLWFwcC1rZXk="
    }
    lambda_zip_overrides = {
      ami_housekeeper        = run.setup_lambda_archive.lambda_archive
      runner_binaries_syncer = run.setup_lambda_archive.lambda_archive
      runners                = run.setup_lambda_archive.lambda_archive
      termination_watcher    = run.setup_lambda_archive.lambda_archive
      webhook                = run.setup_lambda_archive.lambda_archive
    }
  }

  assert {
    condition     = output.webhook_endpoint != ""
    error_message = "The default example should create a webhook endpoint through MiniStack."
  }

  assert {
    condition     = output.runners.lambda_syncer_name != ""
    error_message = "The default example should create the runner binaries sync Lambda through MiniStack."
  }
}
