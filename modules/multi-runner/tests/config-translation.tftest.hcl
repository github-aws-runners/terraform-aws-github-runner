mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/test-role"
    }
  }

  mock_resource "aws_cloudwatch_event_bus" {
    defaults = {
      arn = "arn:aws:events:eu-west-1:123456789012:event-bus/test"
    }
  }

  mock_resource "aws_cloudwatch_event_rule" {
    defaults = {
      arn = "arn:aws:events:eu-west-1:123456789012:rule/test"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn = "arn:aws:lambda:eu-west-1:123456789012:function:test"
    }
  }

  mock_resource "aws_sqs_queue" {
    defaults = {
      arn = "arn:aws:sqs:eu-west-1:123456789012:test"
    }
  }

  mock_resource "aws_s3_bucket" {
    defaults = {
      arn = "arn:aws:s3:::test-runner-binaries"
      id  = "test-runner-binaries"
    }
  }

  mock_resource "aws_apigatewayv2_api" {
    defaults = {
      execution_arn = "arn:aws:execute-api:eu-west-1:123456789012:test"
    }
  }
}

mock_provider "random" {}
mock_provider "null" {}

variables {
  aws_region = "eu-west-1"
  vpc_id     = "vpc-stable"
  subnet_ids = ["subnet-stable"]

  github_app = {
    key_base64_ssm = {
      arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/tests/github-app/key"
      name = "/tests/github-app/key"
    }
    id_ssm = {
      arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/tests/github-app/id"
      name = "/tests/github-app/id"
    }
    webhook_secret_ssm = {
      arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/tests/github-app/webhook-secret"
      name = "/tests/github-app/webhook-secret"
    }
  }

  multi_runner_config = {}

  lambda_s3_bucket      = "test-lambda-artifacts"
  runners_lambda_zip    = "README.md"
  runners_lambda_s3_key = "runners.zip"
  webhook_lambda_s3_key = "webhook.zip"
  syncer_lambda_s3_key  = "runner-binaries-syncer.zip"
}

run "empty_experimental_map_translates_stable_inputs" {
  command = plan

  variables {
    tags = {
      source = "stable"
    }

    role_path                 = "/stable/"
    role_permissions_boundary = "arn:aws:iam::123456789012:policy/stable-boundary"
    queue_selection_strategy  = "random"
    repository_white_list     = ["example/repository"]
    additional_github_apps = [{
      id              = "additional-app-id"
      key_base64      = "additional-app-key"
      installation_id = "additional-installation-id"
    }]
    ghes_url                                                       = "https://github.example.test"
    ghes_ssl_verify                                                = false
    user_agent                                                     = "stable-test-agent"
    eventbridge                                                    = { enable = false, accept_events = ["workflow_job"] }
    matcher_config_parameter_store_tier                            = "Advanced"
    scale_up_lambda_memory_size                                    = 1024
    runners_scale_up_lambda_timeout                                = 45
    scale_down_lambda_memory_size                                  = 768
    runners_scale_down_lambda_timeout                              = 75
    webhook_lambda_memory_size                                     = 384
    webhook_lambda_timeout                                         = 20
    pool_lambda_timeout                                            = 90
    pool_lambda_reserved_concurrent_executions                     = 2
    lambda_event_source_mapping_batch_size                         = 25
    lambda_event_source_mapping_maximum_batching_window_in_seconds = 10
    webhook_lambda_apigateway_access_log_settings = {
      destination_arn = "arn:aws:logs:eu-west-1:123456789012:log-group:test"
      format          = "$context.requestId"
    }
    kms_key_arn = "arn:aws:kms:eu-west-1:123456789012:key/stable"
    queue_encryption = {
      kms_data_key_reuse_period_seconds = 300
      kms_master_key_id                 = "arn:aws:kms:eu-west-1:123456789012:key/queue"
      sqs_managed_sse_enabled           = null
    }
    ssm_paths = {
      root    = "legacy-root"
      app     = "legacy-app"
      runners = "legacy-runners"
      webhook = "legacy-webhook"
    }
    parameter_store_tags = { owner = "stable-test" }
    runners_ssm_housekeeper = {
      schedule_expression = "rate(2 days)"
      enabled             = false
      lambda_memory_size  = 640
      lambda_timeout      = 70
      config = {
        tokenPath      = "/stable/tokens"
        minimumDaysOld = 5
        dryRun         = true
      }
    }
    log_level                 = "debug"
    logging_retention_in_days = 30
    logging_kms_key_id        = "arn:aws:kms:eu-west-1:123456789012:key/logs"
    log_class                 = "INFREQUENT_ACCESS"
    tracing_config = {
      mode                  = "Active"
      capture_http_requests = true
      capture_error         = true
    }
    metrics = {
      enable    = true
      namespace = "StableTest"
      metric = {
        enable_github_app_rate_limit    = false
        enable_job_retry                = false
        enable_spot_termination_warning = false
      }
    }
    enable_managed_runner_security_group = false
    runner_egress_rules = [{
      cidr_blocks      = ["10.0.0.0/8"]
      ipv6_cidr_blocks = []
      prefix_list_ids  = []
      from_port        = 443
      protocol         = "tcp"
      security_groups  = []
      self             = false
      to_port          = 443
      description      = "stable-test"
    }]
    runner_additional_security_group_ids = ["sg-stable"]
    cloudwatch_config                    = "{\"metrics\":{}}"
    instance_profile_path                = "/stable/instance-profile/"
    key_name                             = "stable-key"
    associate_public_ipv4_address        = true
    instance_termination_watcher = {
      enable                       = true
      enable_runner_deregistration = false
      environment_variables        = { MODE = "stable-test" }
      memory_size                  = 256
      timeout                      = 40
      zip                          = "watcher.zip"
      s3_key                       = "watcher.zip"
      s3_object_version            = "watcher-version"
    }
    runner_binaries_s3_sse_configuration = {
      rule = {
        bucket_key_enabled = true
        apply_server_side_encryption_by_default = {
          sse_algorithm     = "aws:kms"
          kms_master_key_id = "arn:aws:kms:eu-west-1:123456789012:key/binaries"
        }
      }
    }
    runner_binaries_s3_tags          = { component = "stable-test" }
    runner_binaries_s3_versioning    = "Enabled"
    state_event_rule_binaries_syncer = "DISABLED"

    experimental_global_config = {
      tags = {
        source = "experimental-ignored"
      }
      roles = {
        path = "/experimental-ignored/"
      }
    }

    experimental_global_config_github = {
      user_agent = "experimental-ignored"
    }

    experimental_global_config_lambda = {
      runtime = "nodejs22.x"
    }

    experimental_global_config_orchestration_provider = {
      webhook = {
        queue_selection_strategy = "first"
        github = {
          repository_white_list = ["ignored/repository"]
        }
      }
    }

    experimental_global_config_compute_provider = {
      aws = {
        ec2 = {
          vpc_id     = "vpc-experimental-ignored"
          subnet_ids = ["subnet-experimental-ignored"]
        }
      }
    }

    experimental_multi_runner_config = {}

    multi_runner_config = {
      stable = {
        runner_config = {
          runner_os             = "linux"
          runner_architecture   = "x64"
          instance_types        = ["m5.large"]
          runners_maximum_count = 2
          runner_group_name     = "stable-group"
          runner_iam_role_managed_policy_arns = [
            "arn:aws:iam::123456789012:policy/stable-runner",
          ]
        }
        matcherConfig = {
          labelMatchers = [["self-hosted", "linux", "x64"]]
        }
      }
    }
  }

  assert {
    condition = (
      !local.use_v2_config
      && toset(keys(local.normalized_config.multi_runner_config)) == toset(["stable"])
      && tomap(local.normalized_config.tags) == tomap(var.tags)
      && local.normalized_config.roles.path == var.role_path
      && local.normalized_config.roles.permissions_boundary == var.role_permissions_boundary
      && local.normalized_config.github.app.key_base64_ssm == var.github_app.key_base64_ssm
      && local.normalized_config.github.app.id_ssm == var.github_app.id_ssm
      && local.normalized_config.github.app.webhook_secret_ssm == var.github_app.webhook_secret_ssm
      && local.normalized_config.github.user_agent == var.user_agent
      && jsonencode(local.normalized_config.github.additional_apps) == jsonencode(var.additional_github_apps)
      && local.normalized_config.github.enterprise_server.url == var.ghes_url
      && local.normalized_config.github.enterprise_server.ssl_verify == var.ghes_ssl_verify
      && local.normalized_config.lambda.runtime == var.lambda_runtime
      && local.normalized_config.lambda.artifact.s3.bucket == var.lambda_s3_bucket
      && local.normalized_config.lambda.architecture == var.lambda_architecture
      && local.normalized_config.orchestration_provider.webhook.queue_selection_strategy == var.queue_selection_strategy
      && jsonencode(local.normalized_config.orchestration_provider.webhook.eventbridge) == jsonencode(var.eventbridge)
      && local.normalized_config.orchestration_provider.webhook.matcher_config_parameter_store_tier == var.matcher_config_parameter_store_tier
      && tolist(local.normalized_config.orchestration_provider.webhook.github.repository_white_list) == tolist(var.repository_white_list)
      && local.normalized_config.orchestration_provider.webhook.lambda.scale.up.memory_size == var.scale_up_lambda_memory_size
      && local.normalized_config.orchestration_provider.webhook.lambda.scale.down.timeout == var.runners_scale_down_lambda_timeout
      && local.normalized_config.orchestration_provider.webhook.lambda.webhook.memory_size == var.webhook_lambda_memory_size
      && local.normalized_config.orchestration_provider.webhook.lambda.pool.timeout == var.pool_lambda_timeout
      && jsonencode(local.normalized_config.orchestration_provider.webhook.queue.encryption) == jsonencode(var.queue_encryption)
      && local.normalized_config.ssm.paths.root == "/${var.ssm_paths.root}/${var.prefix}"
      && local.normalized_config.ssm.paths.tokens == "${var.ssm_paths.runners}/tokens"
      && local.normalized_config.ssm.kms_key_id == var.kms_key_arn
      && local.normalized_config.ssm.housekeeper.state == "DISABLED"
      && local.normalized_config.ssm.housekeeper.config.minimumDaysOld == var.runners_ssm_housekeeper.config.minimumDaysOld
      && local.normalized_config.observability.logs.level == var.log_level
      && local.normalized_config.observability.logs.retention_in_days == var.logging_retention_in_days
      && local.normalized_config.observability.logs.kms_key_id == var.logging_kms_key_id
      && jsonencode(local.normalized_config.observability.tracing) == jsonencode(var.tracing_config)
      && local.normalized_config.observability.metrics.namespace == var.metrics.namespace
      && local.normalized_config.compute_provider.aws.ec2.vpc_id == var.vpc_id
      && tolist(local.normalized_config.compute_provider.aws.ec2.subnet_ids) == tolist(var.subnet_ids)
      && local.normalized_config.compute_provider.aws.ec2.managed_security_group_enabled == var.enable_managed_runner_security_group
      && jsonencode(local.normalized_config.compute_provider.aws.ec2.egress_rules) == jsonencode(var.runner_egress_rules)
      && jsonencode(local.normalized_config.compute_provider.aws.ec2.additional_security_group_ids) == jsonencode(var.runner_additional_security_group_ids)
      && local.normalized_config.compute_provider.aws.ec2.cloudwatch_agent.config == var.cloudwatch_config
      && local.normalized_config.compute_provider.aws.ec2.instance_profile_path == var.instance_profile_path
      && local.normalized_config.compute_provider.aws.ec2.key_name == var.key_name
      && local.normalized_config.compute_provider.aws.ec2.associate_public_ipv4_address == var.associate_public_ipv4_address
    )
    error_message = "An empty experimental runner map must translate stable global inputs across every canonical section."
  }

  assert {
    condition = (
      local.stable_to_experimental.tags.source == var.tags.source
      && local.stable_to_experimental.roles.path == var.role_path
      && local.stable_to_experimental.github.user_agent == var.user_agent
      && local.stable_to_experimental.lambda.artifact.s3.bucket == var.lambda_s3_bucket
      && local.stable_to_experimental.orchestration_provider.webhook.lambda.scale.up.event_source_mapping.batch_size == var.lambda_event_source_mapping_batch_size
      && local.stable_to_experimental.orchestration_provider.webhook.lambda.scale.down.idle_config == []
      && local.stable_to_experimental.ssm.parameters.tags.owner == var.parameter_store_tags.owner
      && local.stable_to_experimental.ssm.housekeeper.lambda.memory_size == var.runners_ssm_housekeeper.lambda_memory_size
      && local.stable_to_experimental.compute_provider.aws.ec2.runner_binaries.s3.encryption.sse_algorithm == "aws:kms"
      && local.stable_to_experimental.compute_provider.aws.ec2.runner_binaries.s3.encryption.kms_master_key_id == "arn:aws:kms:eu-west-1:123456789012:key/binaries"
      && local.stable_to_experimental.compute_provider.aws.ec2.instance_termination_watcher.enabled == var.instance_termination_watcher.enable
    )
    error_message = "The stable-to-experimental adapter must preserve nested legacy values without relying on the selector."
  }

  assert {
    condition = (
      local.normalized_config.multi_runner_config["stable"].runner.os == "linux"
      && local.normalized_config.multi_runner_config["stable"].runner.architecture == "x64"
      && local.normalized_config.multi_runner_config["stable"].runner.group_name == "stable-group"
      && local.normalized_config.multi_runner_config["stable"].runner.iam.managed_policy_arns["legacy-0"] == "arn:aws:iam::123456789012:policy/stable-runner"
      && local.normalized_config.multi_runner_config["stable"].orchestration_provider.webhook.runner.maximum_count == 2
      && jsonencode(local.normalized_config.multi_runner_config["stable"].orchestration_provider.webhook.matcherConfig.labelMatchers) == jsonencode([["self-hosted", "linux", "x64"]])
      && toset(local.normalized_config.multi_runner_config["stable"].compute_provider.aws.ec2.instance_types) == toset(["m5.large"])
    )
    error_message = "Stable runner entries must translate into the canonical runner, orchestration, and compute-provider blocks."
  }
}

run "non_empty_experimental_map_is_authoritative" {
  command = plan

  variables {
    tags = {
      source = "stable-ignored"
    }

    multi_runner_config = {
      stable = {
        runner_config = {
          runner_os                     = "linux"
          runner_architecture           = "x64"
          instance_types                = ["m5.large"]
          runners_maximum_count         = 1
          enable_runner_binaries_syncer = false
        }
        matcherConfig = {
          labelMatchers = [["stable"]]
        }
      }
    }

    experimental_global_config = {
      tags = {
        source = "experimental"
      }
      runner = {
        os           = "linux"
        architecture = "arm64"
      }
    }

    experimental_multi_runner_config = {
      experimental = {
        orchestration_provider = {
          webhook = {
            matcherConfig = {
              labelMatchers = [["experimental"]]
            }
          }
        }
        compute_provider = {
          aws = {
            ec2 = {
              instance_types = ["c7g.large"]
            }
          }
        }
      }
    }
  }

  assert {
    condition = (
      local.use_v2_config
      && toset(keys(local.normalized_config.multi_runner_config)) == toset(["experimental"])
      && local.normalized_config.tags.source == "experimental"
      && toset(local.normalized_config.multi_runner_config["experimental"].compute_provider.aws.ec2.instance_types) == toset(["c7g.large"])
      && flatten(local.normalized_config.multi_runner_config["experimental"].orchestration_provider.webhook.matcherConfig.labelMatchers) == ["experimental"]
    )
    error_message = "A non-empty experimental runner map must be authoritative and must not merge stable lanes or flat defaults."
  }

  assert {
    condition     = jsonencode(local.normalized_config) == jsonencode(local.experimental)
    error_message = "A non-empty experimental runner map must select the experimental object without leaking stable flat inputs."
  }

}

run "lane_values_override_experimental_globals" {
  command = plan

  variables {
    experimental_global_config = {
      tags = {
        scope      = "global"
        precedence = "global"
      }

      runner = {
        os           = "linux"
        architecture = "x64"
        group_name   = "global-group"
        iam = {
          managed_policy_arns = {
            global = "arn:aws:iam::123456789012:policy/global-runner"
          }
          additional_trust_policy_json = "{}"
        }
      }
    }

    experimental_global_config_orchestration_provider = {
      webhook = {
        runner = {
          maximum_count = 4
        }
      }
    }

    experimental_global_config_observability = {
      logs = {
        level             = "debug"
        retention_in_days = 30
      }
    }

    experimental_global_config_ssm = {
      housekeeper = {
        lambda = {
          artifact = {
            zip = "global-housekeeper.zip"
          }
        }
      }
    }

    experimental_global_config_compute_provider = {
      aws = {
        ec2 = {
          vpc_id     = "vpc-experimental"
          subnet_ids = ["subnet-global"]
          tags = {
            precedence = "global"
            global     = "true"
          }
        }
      }
    }

    experimental_multi_runner_config = {
      lane = {
        tags = {
          precedence = "lane"
          lane       = "true"
        }
        runner = {
          group_name = "lane-group"
          iam = {
            role = {
              arn = "arn:aws:iam::123456789012:role/external-runner"
            }
          }
        }
        orchestration_provider = {
          webhook = {
            runner = {
              maximum_count = 7
            }
            matcherConfig = {
              labelMatchers = [["self-hosted", "linux", "x64", "lane"]]
            }
          }
        }
        observability = {
          logs = {
            level = "warn"
          }
        }
        ssm = {
          housekeeper = {
            lambda = {
              artifact = {
                s3 = {
                  key = "lane-housekeeper.zip"
                }
              }
            }
          }
        }
        compute_provider = {
          aws = {
            ec2 = {
              instance_types = ["m7i.large"]
              subnet_ids     = ["subnet-lane"]
              instance_profile = {
                name = "lane-runner-profile"
              }
              tags = {
                precedence = "lane"
                provider   = "lane"
              }
            }
          }
        }
      }
    }
  }

  assert {
    condition = (
      local.resolved_config.multi_runner_config["lane"].runner.os == "linux"
      && local.resolved_config.multi_runner_config["lane"].runner.architecture == "x64"
      && local.resolved_config.multi_runner_config["lane"].runner.group_name == "lane-group"
      && local.resolved_config.multi_runner_config["lane"].orchestration_provider.webhook.runner.maximum_count == 7
      && local.resolved_config.multi_runner_config["lane"].observability.logs.level == "warn"
      && local.resolved_config.multi_runner_config["lane"].observability.logs.retention_in_days == 30
      && local.resolved_config.multi_runner_config["lane"].ssm.housekeeper.lambda.artifact.zip == null
      && local.resolved_config.multi_runner_config["lane"].ssm.housekeeper.lambda.artifact.s3.key == "lane-housekeeper.zip"
    )
    error_message = "Lane values must override experimental globals while omitted values inherit their global defaults."
  }

  assert {
    condition = (
      tomap(local.resolved_config.multi_runner_config["lane"].tags) == tomap({
        scope      = "global"
        precedence = "lane"
        lane       = "true"
      })
      && local.resolved_config.multi_runner_config["lane"].compute_provider.aws.ec2.vpc_id == "vpc-experimental"
      && toset(local.resolved_config.multi_runner_config["lane"].compute_provider.aws.ec2.subnet_ids) == toset(["subnet-lane"])
      && tomap(local.resolved_config.multi_runner_config["lane"].compute_provider.aws.ec2.tags) == tomap({
        precedence = "lane"
        global     = "true"
        provider   = "lane"
      })
    )
    error_message = "Tags and EC2 defaults must merge from experimental globals with lane values taking precedence."
  }

  assert {
    condition = (
      local.resolved_config.multi_runner_config["lane"].runner.iam.role.arn == "arn:aws:iam::123456789012:role/external-runner"
      && length(local.resolved_config.multi_runner_config["lane"].runner.iam.managed_policy_arns) == 0
      && local.resolved_config.multi_runner_config["lane"].runner.iam.additional_trust_policy_json == null
    )
    error_message = "An externally managed runner role must suppress inherited managed policies and trust-policy additions."
  }
}

run "global_external_runner_role_suppresses_inherited_iam_overrides" {
  command = plan

  variables {
    experimental_global_config = {
      runner = {
        os           = "linux"
        architecture = "x64"
        iam = {
          role = {
            arn = "arn:aws:iam::123456789012:role/global-external-runner"
          }
          managed_policy_arns = {
            global = "arn:aws:iam::123456789012:policy/global-runner"
          }
          additional_trust_policy_json = "{\"Version\":\"2012-10-17\"}"
        }
      }
    }

    experimental_global_config_compute_provider = {
      aws = {
        ec2 = {
          vpc_id     = "vpc-global"
          subnet_ids = ["subnet-global"]
        }
      }
    }

    experimental_multi_runner_config = {
      lane = {
        orchestration_provider = {
          webhook = {
            matcherConfig = {
              labelMatchers = [["self-hosted"]]
            }
          }
        }
        compute_provider = {
          aws = {
            ec2 = {
              instance_types = ["m5.large"]
              instance_profile = {
                name = "global-runner-profile"
              }
            }
          }
        }
      }
    }
  }

  assert {
    condition = (
      local.resolved_config.multi_runner_config["lane"].runner.iam.role.arn == "arn:aws:iam::123456789012:role/global-external-runner"
      && length(local.resolved_config.multi_runner_config["lane"].runner.iam.managed_policy_arns) == 0
      && local.resolved_config.multi_runner_config["lane"].runner.iam.additional_trust_policy_json == null
    )
    error_message = "A global external runner role must suppress inherited managed policies and trust-policy additions."
  }
}
