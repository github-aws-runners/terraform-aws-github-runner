mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

variables {
  config = {
    prefix     = "scale-set-test"
    aws_region = "eu-west-1"

    github = {
      config_url  = "https://github.com/example"
      kms_key_arn = "arn:aws:kms:eu-west-1:123456789012:key/github-app-credentials"
      app_parameters = {
        id = [{
          name = "/github-runner/app-id"
          arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id"
        }]
        key_base64 = [{
          name = "/github-runner/app-key"
          arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-key"
        }]
        installation_id = [null]
      }
    }

    scale_set = {
      id          = 123
      min_runners = 0
      max_runners = 10
    }

    runner = {
      name_prefix = ""
    }

    ssm = {
      token_path     = "/github-runner/tokens"
      token_path_arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/tokens/*"
    }

    ecs = {
      container_image = "public.ecr.aws/example/scale-set-listener@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      vpc_id          = "vpc-0123456789abcdef0"
      subnet_ids      = ["subnet-0123456789abcdef0"]
    }
  }

  runner_provider = {
    type = "test"
    environment_variables = {
      PROVIDER_SETTING = "provider-value"
      SCALE_SET_ID     = "must-not-override-common-value"
    }
    iam_policy_json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
  }
}

run "plans_provider_neutral_singleton_listener" {
  command = plan

  assert {
    condition = (
      aws_ecs_service.listener.desired_count == 1 &&
      aws_ecs_service.listener.launch_type == "FARGATE" &&
      aws_ecs_service.listener.deployment_minimum_healthy_percent == 0 &&
      aws_ecs_service.listener.deployment_maximum_percent == 100 &&
      aws_ecs_service.listener.deployment_circuit_breaker[0].enable &&
      aws_ecs_service.listener.deployment_circuit_breaker[0].rollback &&
      length(aws_ecs_service.listener.load_balancer) == 0
    )
    error_message = "The listener must deploy as a non-overlapping singleton Fargate service with rollback and no load balancer."
  }

  assert {
    condition = (
      aws_ecs_task_definition.listener.network_mode == "awsvpc" &&
      contains(aws_ecs_task_definition.listener.requires_compatibilities, "FARGATE") &&
      aws_ecs_task_definition.listener.runtime_platform[0].cpu_architecture == "X86_64"
    )
    error_message = "The listener task must use the configured Fargate runtime."
  }

  assert {
    condition = (
      jsondecode(aws_ecs_task_definition.listener.container_definitions)[0].stopTimeout == 120 &&
      jsondecode(aws_ecs_task_definition.listener.container_definitions)[0].readonlyRootFilesystem == true &&
      jsondecode(aws_ecs_task_definition.listener.container_definitions)[0].user == "1000:1000"
    )
    error_message = "The listener container must be non-root, read-only, and have the full Fargate stop window."
  }

  assert {
    condition = (
      local.container_environment.COMPUTE_PROVIDER_TYPE == "test" &&
      local.container_environment.PROVIDER_SETTING == "provider-value" &&
      local.container_environment.SCALE_SET_ID == "123" &&
      local.container_environment.RUNNER_NAME_PREFIX == "" &&
      !contains(keys(local.container_environment), "GITHUB_ACTIONS_FORCE_GHES")
    )
    error_message = "The listener must merge provider settings with protected common values while preserving an empty runner prefix."
  }

  assert {
    condition = (
      length(aws_ecs_cluster.listener) == 1 &&
      length(aws_security_group.listener) == 1 &&
      length(aws_cloudwatch_metric_alarm.listener_missing) == 0
    )
    error_message = "The listener should create its default cluster and outbound-only security group while leaving the missing-task alarm opt-in."
  }

  assert {
    condition     = aws_iam_role_policy.task_runner_provider.policy == var.runner_provider.iam_policy_json
    error_message = "Provider-specific permissions must remain in their own task-role inline policy."
  }

  assert {
    condition = contains(
      flatten([for statement in data.aws_iam_policy_document.task_common.statement : statement.actions]),
      "ssm:DeleteParameter",
    )
    error_message = "The listener must be able to win the SSM deletion handshake for a surplus runner's exact JIT parameter before termination."
  }

  assert {
    condition = anytrue([
      for statement in data.aws_iam_policy_document.task_common.statement :
      contains(statement.actions, "kms:Decrypt") &&
      contains(statement.resources, "arn:aws:kms:eu-west-1:123456789012:key/github-app-credentials")
    ])
    error_message = "The listener task must decrypt GitHub App parameters encrypted with the configured SSM KMS key."
  }
}

run "plans_with_external_network_and_cluster" {
  command = plan

  variables {
    config = {
      prefix     = "scale-set-test"
      aws_region = "eu-west-1"

      github = {
        config_url = "https://example.ghe.com/example"
        ghes_url   = "https://example.ghe.com"
        force_ghes = true
        app_parameters = {
          id = [{
            name = "/github-runner/app-id"
            arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id"
          }]
          key_base64 = [{
            name = "/github-runner/app-key"
            arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-key"
          }]
          installation_id = [null]
        }
      }

      scale_set = {
        id               = 123
        min_runners      = 1
        max_runners      = 10
        github_app_index = 0
      }

      runner = {
        name_prefix = ""
      }

      ssm = {
        token_path     = "/github-runner/tokens"
        token_path_arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/tokens/*"
      }

      ecs = {
        container_image = "public.ecr.aws/example/scale-set-listener@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        vpc_id          = "vpc-0123456789abcdef0"
        subnet_ids      = ["subnet-0123456789abcdef0"]
        cluster = {
          arn = "arn:aws:ecs:eu-west-1:123456789012:cluster/shared-listeners"
        }
        create_security_group = false
        security_group_ids    = ["sg-0123456789abcdef0"]
      }
    }
  }

  assert {
    condition = (
      length(aws_ecs_cluster.listener) == 0 &&
      length(aws_security_group.listener) == 0 &&
      aws_ecs_service.listener.cluster == "arn:aws:ecs:eu-west-1:123456789012:cluster/shared-listeners" &&
      toset(aws_ecs_service.listener.network_configuration[0].security_groups) == toset(["sg-0123456789abcdef0"])
    )
    error_message = "External ECS cluster and security groups must be used without creating replacements."
  }

  assert {
    condition     = !contains(keys(local.container_environment), "GITHUB_ACTIONS_FORCE_GHES")
    error_message = "GHEC data-residency URLs must not be forced through GHES /api/v3 routing."
  }
}
