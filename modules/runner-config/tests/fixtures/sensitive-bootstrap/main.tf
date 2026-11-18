terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

# Apply sensitivity inside the fixture: OpenTofu cannot serialize nested sensitive
# values supplied directly by a test variables block.
variable "user_data" {
  type = map(string)
}

variable "computed_bootstrap" {
  type    = bool
  default = false
}

resource "terraform_data" "bootstrap" {
  input = "computed-bootstrap-value"
}

module "runner" {
  source     = "../../.."
  aws_region = "eu-west-1"

  compute_provider = {
    aws = {
      ec2 = {
        vpc_id         = "vpc-12345678"
        subnet_ids     = ["subnet-12345678"]
        instance_types = ["m5.large"]
        ssm_enabled    = true
        user_data      = { for key, value in var.user_data : key => sensitive(var.computed_bootstrap ? "${value}${terraform_data.bootstrap.output}" : value) }
        ami = {
          filter = { state = ["available"] }
          owners = ["amazon"]
          id_ssm_parameter = {
            arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/external-ami-id"
          }
          kms_key = null
        }
        binaries_syncer = {
          s3 = {
            arn = "arn:aws:s3:::my-bucket"
            id  = "my-bucket"
            key = "runners/linux/actions-runner.tar.gz"
          }
        }
      }
    }
  }

  runner = {
    labels = ["self-hosted", "linux", "x64"]
    iam = {
      managed_policy_arns = {
        readonly = "arn:aws:iam::aws:policy/ReadOnlyAccess"
      }
      additional_trust_policy_json = jsonencode({
        Version = "2012-10-17"
        Statement = [{
          Sid       = "AdditionalTrustedAccount"
          Effect    = "Allow"
          Action    = "sts:AssumeRole"
          Principal = { AWS = "arn:aws:iam::210987654321:root" }
        }]
      })
    }
  }

  lambda = {
    artifact = {
      s3 = {
        bucket = "my-lambda-bucket"
      }
    }
  }

  github = {
    app_parameters = {
      key_base64 = { name = "/github-runner/key-base64", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64" }
      id         = { name = "/github-runner/app-id", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id" }
    }
  }

  orchestration_provider = {
    webhook = {
      runner = {
        boot_time_in_minutes = 8
        ephemeral            = true
        jit_config_enabled   = null
        maximum_count        = 9
      }
      github = {
        organization_runners = true
      }
      queue = {
        build = {
          arn = "arn:aws:sqs:eu-west-1:123456789012:build-queue"
          url = "https://sqs.eu-west-1.amazonaws.com/123456789012/build-queue"
        }
      }
      lambda = {
        artifact = {
          s3 = {
            key = "runners.zip"
          }
        }
        pool = {
          config = [{
            schedule_expression = "cron(0 8 * * ? *)"
            size                = 1
          }]
        }
      }
    }
  }

  storage_provider = {
    aws = {
      ssm = {
        paths = {
          root   = "/github-runner"
          tokens = "tokens"
          config = "config"
        }
      }
    }
  }

}

output "user_data_sensitive" {
  value = issensitive(module.runner.provider.aws.ec2.launch_template.user_data)
}

output "provider_type" {
  value = module.runner.compute_provider_contract.type
}
