mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/runner-test"
    }
  }

  mock_resource "aws_ssm_parameter" {
    defaults = {
      arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/config"
    }
  }
}

variables {
  aws_region = "eu-west-1"
  prefix     = "scale-set-runner"

  runner = {
    labels             = ["self-hosted", "linux", "x64", "scale-set"]
    ephemeral          = true
    jit_config_enabled = true
    maximum_count      = 4
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
    scale_set = {
      id                = 101
      github_config_url = "https://github.com/example"
      min_runners       = 1
      container_image   = "ghcr.io/example/listener@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
      ecs = {
        vpc_id     = "vpc-12345678"
        subnet_ids = ["subnet-12345678"]
      }
      iam = {
        role_path            = "/scale-set/"
        permissions_boundary = "arn:aws:iam::123456789012:policy/scale-set-boundary"
      }
    }
  }

  lambda = {
    s3 = {
      bucket = "my-lambda-bucket"
      key    = "runners.zip"
    }
  }

  compute_provider = {
    ec2 = {
      vpc_id         = "vpc-12345678"
      subnet_ids     = ["subnet-12345678"]
      instance_types = ["m5.large"]
      ami = {
        id_ssm_parameter = {
          arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/external-ami-id"
        }
      }
      binaries_syncer = {
        enabled = false
      }
      metadata_options = {
        instance_metadata_tags = "enabled"
        http_endpoint          = "enabled"
      }
    }
  }

  ssm = {
    paths = {
      root   = "/github-runner"
      tokens = "tokens"
      config = "config"
    }
  }
}

run "scale_set_excludes_classic_orchestration_resources" {
  command = plan

  assert {
    condition = (
      length(module.scale_runners) == 0 &&
      length(module.pool) == 0 &&
      length(module.job_retry) == 0 &&
      length(module.scale_set_listener) == 1
    )
    error_message = "A scale-set lane must create its ECS listener without classic scale, pool, or retry modules."
  }

  assert {
    condition = (
      output.orchestration.webhook == null &&
      output.orchestration.scale_set != null &&
      output.scale_set == output.orchestration.scale_set &&
      output.scale_up == null &&
      output.scale_down == null &&
      output.pool == null
    )
    error_message = "The orchestration output and nullable compatibility aliases must expose only the selected scale-set provider."
  }

  assert {
    condition = (
      module.scale_set_listener[0].listener.task_role.path == "/scale-set/" &&
      module.scale_set_listener[0].listener.task_role.permissions_boundary == "arn:aws:iam::123456789012:policy/scale-set-boundary"
    )
    error_message = "The scale-set listener must consume its own nested IAM boundary rather than Lambda-role settings."
  }

  assert {
    condition     = module.ssm_housekeeper.housekeeper.lambda != null
    error_message = "Common SSM lifecycle maintenance must remain available in scale-set mode."
  }
}

run "rejects_both_orchestration_providers" {
  command = plan

  variables {
    orchestration = {
      webhook = {
        github = {
          organization_runners = true
        }
        queue = {
          build = {
            arn = "arn:aws:sqs:eu-west-1:123456789012:build-queue"
            url = "https://sqs.eu-west-1.amazonaws.com/123456789012/build-queue"
          }
        }
      }
      scale_set = {
        id                = 101
        github_config_url = "https://github.com/example"
        min_runners       = 1
        container_image   = "ghcr.io/example/listener@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        ecs = {
          vpc_id     = "vpc-12345678"
          subnet_ids = ["subnet-12345678"]
        }
      }
    }
  }

  expect_failures = [var.orchestration]
}

run "rejects_missing_orchestration_provider" {
  command = plan

  variables {
    orchestration = {}
  }

  expect_failures = [var.orchestration]
}
