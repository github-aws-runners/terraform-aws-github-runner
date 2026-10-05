mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/runner-test"
    }
  }

  mock_resource "aws_ssm_parameter" {
    defaults = {
      arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/ami-id"
    }
  }
}

# The runner archive is injected during packaging, so isolate the common
# housekeeper child in source-checkout tests where that build artifact is absent.
override_module {
  target = module.ssm_housekeeper
}

variables {
  aws_region = "eu-west-1"

  compute_provider = {
    aws = {
      ec2 = {
        vpc_id         = "vpc-12345678"
        subnet_ids     = ["subnet-12345678"]
        instance_types = ["m5.large"]
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
        organization_runners = false
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
            schedule_expression = "cron(* * * * ? *)"
            size                = 2
          }]
          warm = {
            enabled       = true
            max_age_hours = 24
          }
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

run "warm_pool_wires_pool_and_scale_up" {
  command = plan

  assert {
    condition = (
      module.orchestration_webhook[0].pool.lambda.environment[0].variables["WARM_POOL_ENABLED"] == "true"
      && module.orchestration_webhook[0].pool.lambda.environment[0].variables["WARM_POOL_MAX_AGE_HOURS"] == "24"
      && module.orchestration_webhook[0].scale_up.lambda.environment[0].variables["WARM_POOL_ENABLED"] == "true"
      && contains(keys(module.orchestration_webhook[0].scale_up.lambda.environment[0].variables), "WARM_POOL_INDEX_TABLE_NAME")
      && contains(keys(module.orchestration_webhook[0].pool.lambda.environment[0].variables), "WARM_POOL_INDEX_TABLE_NAME")
      && contains(keys(module.orchestration_webhook[0].scale_up.lambda.environment[0].variables), "ENABLE_METRIC_WARM_POOL")
    )
    error_message = "Warm pool settings must reach the pool and scale-up lambdas for repository-level runners."
  }
}

run "warm_pool_disabled_leaves_lambdas_unchanged" {
  command = plan

  variables {
    orchestration_provider = merge(var.orchestration_provider, {
      webhook = merge(var.orchestration_provider.webhook, {
        lambda = merge(var.orchestration_provider.webhook.lambda, {
          pool = merge(var.orchestration_provider.webhook.lambda.pool, { warm = { enabled = false } })
        })
      })
    })
  }

  assert {
    condition = (
      !contains(keys(module.orchestration_webhook[0].pool.lambda.environment[0].variables), "WARM_POOL_ENABLED")
      && !contains(keys(module.orchestration_webhook[0].scale_up.lambda.environment[0].variables), "WARM_POOL_ENABLED")
    )
    error_message = "Disabled warm pool must not change the pool or scale-up lambdas."
  }
}

run "warm_pool_requires_pool_config" {
  command = plan

  variables {
    orchestration_provider = merge(var.orchestration_provider, {
      webhook = merge(var.orchestration_provider.webhook, {
        lambda = merge(var.orchestration_provider.webhook.lambda, {
          pool = merge(var.orchestration_provider.webhook.lambda.pool, { config = [] })
        })
      })
    })
  }

  expect_failures = [terraform_data.validate_config]
}

run "warm_pool_rejects_fractional_max_age" {
  command = plan

  variables {
    orchestration_provider = merge(var.orchestration_provider, {
      webhook = merge(var.orchestration_provider.webhook, {
        lambda = merge(var.orchestration_provider.webhook.lambda, {
          pool = merge(var.orchestration_provider.webhook.lambda.pool, { warm = { enabled = true, max_age_hours = 0.5 } })
        })
      })
    })
  }

  expect_failures = [var.orchestration_provider]
}
