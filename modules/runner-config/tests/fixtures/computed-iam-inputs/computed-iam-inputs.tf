# A .tftest.hcl variable block supplies plan-known values. This wrapper uses
# random_id results to exercise caller inputs that remain unknown during plan,
# which catches invalid count, for_each, and dynamic-block expressions in the
# IAM boundary.
resource "random_id" "external" {
  byte_length = 4
}

resource "random_id" "generated_policy" {
  byte_length = 4
}

module "external_iam" {
  source = "../../.."

  aws_region = "eu-west-1"
  prefix     = "computed-external"

  compute_provider = {
    ec2 = {
      vpc_id         = "vpc-12345678"
      subnet_ids     = ["subnet-12345678"]
      instance_types = ["m5.large"]
      ami = {
        id_ssm_parameter = {
          arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/external-ami-${random_id.external.hex}"
        }
        kms_key = {
          arn = "arn:aws:kms:eu-west-1:123456789012:key/${random_id.external.hex}"
        }
      }
      instance_profile = {
        name = "external-runner-${random_id.external.hex}"
      }
      cloudwatch_agent = {
        enabled = false
      }
      binaries_syncer = {
        enabled = false
      }
    }
  }

  runner = {
    labels = ["self-hosted", "linux", "x64"]
    iam = {
      role = {
        arn = "arn:aws:iam::123456789012:role/external-runner-${random_id.external.hex}"
      }
    }
  }

  lambda = {
    artifact = {
      s3 = {
        bucket = "lambda-artifacts"
      }
    }
  }

  github = {
    app_parameters = {
      key_base64 = [{
        name = "/github-runner/key-base64"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64"
      }]
      id = [{
        name = "/github-runner/app-id"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id"
      }]
      installation_id = [null]
    }
  }

  orchestration = {
    webhook = {
      runner = {
        maximum_count = 3
      }
      github = {
        organization_runners = true
      }
      queue = {
        build = {
          arn = "arn:aws:sqs:eu-west-1:123456789012:computed-external"
          url = "https://sqs.eu-west-1.amazonaws.com/123456789012/computed-external"
        }
        kms_key_id = "arn:aws:kms:eu-west-1:123456789012:key/build-queue-${random_id.external.hex}"
      }
      lambda = {
        scale = {
          artifact = {
            s3 = {
              key = "runners.zip"
            }
          }
        }
        pool = {
          runner_owner = "example"
          config = [{
            schedule_expression = "cron(0 8 * * ? *)"
            size                = 1
          }]
        }
      }
      job_retry = {
        enabled = true
      }
    }
  }

  ssm = {
    kms_key_id = "arn:aws:kms:eu-west-1:123456789012:key/${random_id.external.hex}"
    paths = {
      root   = "/github-runner/computed-external"
      tokens = "tokens"
      config = "config"
    }
  }
}

module "generated_policy" {
  source = "../../.."

  aws_region = "eu-west-1"
  prefix     = "computed-policy"

  compute_provider = {
    ec2 = {
      vpc_id         = "vpc-12345678"
      subnet_ids     = ["subnet-12345678"]
      instance_types = ["m5.large"]
      cloudwatch_agent = {
        enabled = false
      }
      binaries_syncer = {
        enabled = false
      }
    }
  }

  runner = {
    labels = ["self-hosted", "linux", "x64"]
    iam = {
      managed_policy_arns = {
        generated = "arn:aws:iam::123456789012:policy/generated-runner-${random_id.generated_policy.hex}"
      }
    }
  }

  lambda = {
    artifact = {
      s3 = {
        bucket = "lambda-artifacts"
      }
    }
  }

  github = {
    app_parameters = {
      key_base64 = [{
        name = "/github-runner/key-base64"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64"
      }]
      id = [{
        name = "/github-runner/app-id"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id"
      }]
      installation_id = [null]
    }
  }

  orchestration = {
    webhook = {
      runner = {
        maximum_count = 3
      }
      github = {
        organization_runners = true
      }
      queue = {
        build = {
          arn = "arn:aws:sqs:eu-west-1:123456789012:computed-policy"
          url = "https://sqs.eu-west-1.amazonaws.com/123456789012/computed-policy"
        }
      }
      lambda = {
        scale = {
          artifact = {
            s3 = {
              key = "runners.zip"
            }
          }
        }
      }
    }
  }

  ssm = {
    paths = {
      root   = "/github-runner/computed-policy"
      tokens = "tokens"
      config = "config"
    }
  }
}

output "external_role_runner_count" {
  value = module.external_iam.runner.role == null ? 0 : 1
}

output "generated_policy_role_runner_count" {
  value = module.generated_policy.runner.role == null ? 0 : 1
}
