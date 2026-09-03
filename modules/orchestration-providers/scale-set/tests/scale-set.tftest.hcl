mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }

  mock_data "aws_partition" {
    defaults = {
      partition = "aws"
    }
  }

  mock_data "aws_region" {
    defaults = {
      region = "eu-west-1"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/scale-set-test"
    }
  }

  mock_resource "aws_ecs_cluster" {
    defaults = {
      arn = "arn:aws:ecs:eu-west-1:123456789012:cluster/scale-set-test"
    }
  }
}

variables {
  prefix = "scale-set-test"

  runner_configs = {
    linux-small = {
      github = {
        config_url = "https://github.com/example"
        app = {
          app_id = {
            name = "/github/linux-small/app-id"
            arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github/linux-small/app-id"
          }
          private_key = {
            name        = "/github/linux-small/private-key"
            arn         = "arn:aws:ssm:eu-west-1:123456789012:parameter/github/linux-small/private-key"
            kms_key_arn = "arn:aws:kms:eu-west-1:123456789012:key/11111111-1111-1111-1111-111111111111"
          }
          installation_id = {
            name = "/github/linux-small/installation-id"
            arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github/linux-small/installation-id"
          }
        }
        user_agent = "scale-set-test"
        ssl_verify = false
      }
      scale_set = {
        id              = 101
        name            = "linux-small"
        runner_group_id = 1
        min_runners     = 1
        max_runners     = 10
      }
    }
    linux-large = {
      github = {
        config_url = "https://github.com/example"
        app = {
          app_id = {
            name = "/github/linux-large/app-id"
            arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github/linux-large/app-id"
          }
          private_key = {
            name = "/github/linux-large/private-key"
            arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github/linux-large/private-key"
          }
          installation_id = {
            name = "/github/linux-large/installation-id"
            arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github/linux-large/installation-id"
          }
        }
      }
      scale_set = {
        id          = 102
        name        = "linux-large"
        min_runners = 0
        max_runners = 20
      }
      work_folder = "_work/linux-large"
    }
    microvm = {
      github = {
        config_url = "https://github.com/example/repository"
        app = {
          app_id = {
            name = "/github/microvm/app-id"
            arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github/microvm/app-id"
          }
          private_key = {
            name = "/github/microvm/private-key"
            arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github/microvm/private-key"
          }
          installation_id = {
            name = "/github/microvm/installation-id"
            arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github/microvm/installation-id"
          }
        }
        force_ghes = false
      }
      scale_set = {
        id            = 201
        name          = "microvm"
        min_runners   = 0
        max_runners   = 5
        session_owner = "test.microvm"
      }
    }
  }

  compute_provider_contracts = {
    linux-small = {
      type = "ec2"
      capabilities = {
        scale_set = {
          configuration_json = jsonencode({
            region                 = "eu-west-1"
            environment            = "scale-set-test"
            runnerOwner            = "example"
            runnerType             = "Org"
            runnerNamePrefix       = "small-"
            jitConfigParameterPath = "/scale-set-test/runners/tokens"
            subnets                = ["subnet-11111111"]
            launchTemplateName     = "lt-small"
            ec2instanceCriteria = {
              instanceTypes              = ["m7i.large"]
              targetCapacityType         = "on-demand"
              instanceAllocationStrategy = "lowest-price"
            }
            scaleErrors = []
          })
          environment_variables = {
            EC2_CONTROLLER_MODE = "grouped"
          }
          iam_statements = {
            run_instances = {
              actions   = ["ec2:RunInstances"]
              resources = ["arn:aws:ec2:eu-west-1:123456789012:launch-template/lt-small"]
            }
          }
        }
      }
    }
    linux-large = {
      type = "ec2"
      capabilities = {
        scale_set = {
          configuration_json = jsonencode({
            region                 = "eu-west-1"
            environment            = "scale-set-test"
            runnerOwner            = "example"
            runnerType             = "Org"
            runnerNamePrefix       = "large-"
            jitConfigParameterPath = "/scale-set-test/runners/tokens"
            subnets                = ["subnet-22222222"]
            launchTemplateName     = "lt-large"
            ec2instanceCriteria = {
              instanceTypes              = ["m7i.xlarge"]
              targetCapacityType         = "on-demand"
              instanceAllocationStrategy = "lowest-price"
            }
            scaleErrors = []
          })
          environment_variables = {
            EC2_CONTROLLER_MODE = "grouped"
          }
          iam_statements = {
            run_instances = {
              actions   = ["ec2:RunInstances"]
              resources = ["arn:aws:ec2:eu-west-1:123456789012:launch-template/lt-large"]
            }
          }
        }
      }
    }
    microvm = {
      # Future provider used only to prove grouping remains provider-neutral.
      type = "microvm"
      capabilities = {
        scale_set = {
          configuration_json = jsonencode({ image_arn = "arn:aws:lambda:eu-west-1:123456789012:runtime-management-config:microvm" })
          iam_statements = {
            run_microvm = {
              actions   = ["lambda:InvokeFunction"]
              resources = ["arn:aws:lambda:eu-west-1:123456789012:function:microvm"]
            }
          }
        }
      }
    }
  }

  network = {
    vpc_id     = "vpc-12345678"
    subnet_ids = ["subnet-11111111", "subnet-22222222"]
  }

  logging = {
    kms_key_arn = "arn:aws:kms:eu-west-1:123456789012:key/22222222-2222-2222-2222-222222222222"
  }

  tags = {
    Test = "scale-set"
  }
}

run "groups_by_compute_provider_and_hardens_each_task" {
  command = plan

  assert {
    condition = (
      toset(keys(output.controller_groups)) == toset(["ec2", "microvm"]) &&
      toset(output.controller_groups["ec2"].runner_configs) == toset(["linux-small", "linux-large"]) &&
      toset(output.controller_groups["microvm"].runner_configs) == toset(["microvm"])
    )
    error_message = "The default strategy must create one controller group per compute-provider type."
  }

  assert {
    condition = (
      length(aws_ecs_service.controller) == 2 &&
      length(aws_ecs_task_definition.controller) == 2 &&
      length(aws_iam_role.task) == 2 &&
      length(aws_cloudwatch_log_group.controller) == 2 &&
      length(aws_security_group.controller) == 2 &&
      length(aws_ssm_parameter.reconciler_config) == 3
    )
    error_message = "Every group must own one service, task definition, task role, log group, and security group while every reconciler gets one config parameter."
  }

  assert {
    condition = alltrue([
      for service in values(aws_ecs_service.controller) : (
        service.desired_count == 1 &&
        service.deployment_minimum_healthy_percent == 0 &&
        service.deployment_maximum_percent == 100 &&
        service.deployment_circuit_breaker[0].enable &&
        service.deployment_circuit_breaker[0].rollback &&
        !service.network_configuration[0].assign_public_ip &&
        length(service.network_configuration[0].security_groups) == 1
      )
    ])
    error_message = "Services must run one private task and use stop-first deployment with circuit-breaker rollback."
  }

  assert {
    condition = alltrue([
      for task in values(aws_ecs_task_definition.controller) : (
        length(jsondecode(task.container_definitions)) == 1 &&
        jsondecode(task.container_definitions)[0].image == "ghcr.io/github-aws-runners/terraform-aws-github-runner-scale-set-service:latest" &&
        jsondecode(task.container_definitions)[0].versionConsistency == "enabled" &&
        jsondecode(task.container_definitions)[0].readonlyRootFilesystem &&
        !jsondecode(task.container_definitions)[0].privileged &&
        jsondecode(task.container_definitions)[0].user == "10001:10001" &&
        jsondecode(task.container_definitions)[0].linuxParameters.capabilities.drop == ["ALL"] &&
        jsondecode(task.container_definitions)[0].healthCheck.command[3] == "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" &&
        !contains([for entry in jsondecode(task.container_definitions)[0].environment : entry.name], "SCALE_SET_CONTROLLER_MANIFEST")
      )
    ])
    error_message = "Each task definition must contain one hardened controller container using group-path configuration and /healthz liveness."
  }

  assert {
    condition = one([
      for entry in jsondecode(aws_ecs_task_definition.controller["ec2"].container_definitions)[0].environment :
      entry.value if entry.name == "EC2_CONTROLLER_MODE"
    ]) == "grouped"
    error_message = "Provider-owned non-secret environment variables must be merged into their controller group task."
  }

  assert {
    condition = (
      length(aws_security_group.controller["ec2"].ingress) == 0 &&
      length(aws_security_group.controller["ec2"].egress) == 1 &&
      one(aws_security_group.controller["ec2"].egress).from_port == 443 &&
      one(aws_security_group.controller["ec2"].egress).to_port == 443 &&
      aws_cloudwatch_log_group.controller["ec2"].kms_key_id == var.logging.kms_key_arn
    )
    error_message = "Controller networking must have no ingress and only HTTPS egress, and logs must honor customer-managed encryption."
  }

  assert {
    condition = (
      jsondecode(nonsensitive(aws_ssm_parameter.reconciler_config["ec2/linux-small"].value)).schemaVersion == 1 &&
      jsondecode(nonsensitive(aws_ssm_parameter.reconciler_config["ec2/linux-small"].value)).runnerConfigName == "linux-small" &&
      jsondecode(nonsensitive(aws_ssm_parameter.reconciler_config["ec2/linux-small"].value)).scaleSetId == 101 &&
      jsondecode(nonsensitive(aws_ssm_parameter.reconciler_config["ec2/linux-small"].value)).expectedScaleSetName == "linux-small" &&
      jsondecode(nonsensitive(aws_ssm_parameter.reconciler_config["ec2/linux-small"].value)).bootTimeoutMinutes == 10 &&
      jsondecode(nonsensitive(aws_ssm_parameter.reconciler_config["ec2/linux-small"].value)).sslVerify == false &&
      jsondecode(nonsensitive(aws_ssm_parameter.reconciler_config["ec2/linux-small"].value)).githubApp.privateKeyParameterName == "/github/linux-small/private-key" &&
      !contains(keys(jsondecode(nonsensitive(aws_ssm_parameter.reconciler_config["ec2/linux-small"].value))), "runnerConfig")
    )
    error_message = "Each SSM leaf must use the frozen flat reconciler schema and contain references instead of GitHub credential values."
  }

  assert {
    condition = (
      contains(flatten([for statement in data.aws_iam_policy_document.task["ec2"].statement : statement.resources]), "arn:aws:ssm:eu-west-1:123456789012:parameter/github/linux-small/private-key") &&
      !contains(flatten([for statement in data.aws_iam_policy_document.task["ec2"].statement : statement.resources]), "arn:aws:ssm:eu-west-1:123456789012:parameter/github/microvm/private-key") &&
      contains(jsondecode(local.group_github_kms_policy_json["ec2"]).Statement[0].Resource, "arn:aws:kms:eu-west-1:123456789012:key/11111111-1111-1111-1111-111111111111") &&
      length(jsondecode(local.group_github_kms_policy_json["microvm"]).Statement) == 0 &&
      contains(flatten([for statement in data.aws_iam_policy_document.task["ec2"].statement : statement.resources]), "arn:aws:ssm:eu-west-1:123456789012:parameter/scale-set-test/scale-set-controller/ec2/*")
    )
    error_message = "Task IAM must be scoped to its group config prefix, credential parameters, KMS keys, and compute resources."
  }
}

run "supports_one_group_per_runner_config" {
  command = plan

  variables {
    grouping = {
      strategy = "runner_config"
    }
    container = {
      image = "ghcr.io/example/scale-set-controller@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  }

  assert {
    condition = (
      toset(keys(output.controller_groups)) == toset(["linux-small", "linux-large", "microvm"]) &&
      length(aws_ecs_service.controller) == 3 &&
      output.resolved_container_image == "ghcr.io/example/scale-set-controller@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    )
    error_message = "runner_config grouping must create one independently deployable controller task per runner config and honor an image override."
  }
}

run "supports_exact_custom_groups" {
  command = plan

  variables {
    grouping = {
      strategy = "custom"
      custom = {
        groups = {
          general = {
            runner_configs = ["linux-small", "microvm"]
          }
          isolated = {
            runner_configs = ["linux-large"]
          }
        }
      }
    }
  }

  assert {
    condition = (
      toset(keys(output.controller_groups)) == toset(["general", "isolated"]) &&
      toset(output.controller_groups.general.runner_configs) == toset(["linux-small", "microvm"]) &&
      toset(output.controller_groups.isolated.runner_configs) == toset(["linux-large"])
    )
    error_message = "Custom grouping must preserve the exact declared assignment."
  }
}

run "rejects_duplicate_custom_membership" {
  command = plan

  plan_options {
    target = [terraform_data.validate_grouping]
  }

  variables {
    grouping = {
      strategy = "custom"
      custom = {
        groups = {
          first = {
            runner_configs = ["linux-small", "linux-large"]
          }
          second = {
            runner_configs = ["linux-small", "microvm"]
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_grouping]
}

run "rejects_incomplete_custom_membership" {
  command = plan

  plan_options {
    target = [terraform_data.validate_grouping]
  }

  variables {
    grouping = {
      strategy = "custom"
      custom = {
        groups = {
          partial = {
            runner_configs = ["linux-small", "linux-large"]
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_grouping]
}

run "rejects_contract_key_mismatch" {
  command = plan

  plan_options {
    target = [terraform_data.validate_contract]
  }

  variables {
    compute_provider_contracts = {
      linux-small = var.compute_provider_contracts.linux-small
      linux-large = var.compute_provider_contracts.linux-large
    }
  }

  expect_failures = [terraform_data.validate_contract]
}

run "rejects_readiness_path_as_ecs_liveness" {
  command = plan

  plan_options {
    target = [terraform_data.validate_runtime]
  }

  variables {
    container = {
      health_path = "/readyz"
    }
  }

  expect_failures = [terraform_data.validate_runtime]
}

run "rejects_oversized_standard_parameter" {
  command = plan

  plan_options {
    target = [terraform_data.validate_config_store]
  }

  variables {
    compute_provider_contracts = merge(var.compute_provider_contracts, {
      linux-small = merge(var.compute_provider_contracts.linux-small, {
        capabilities = {
          scale_set = merge(var.compute_provider_contracts.linux-small.capabilities.scale_set, {
            configuration_json = jsonencode({ payload = join("", [for index in range(1000) : "xxxxxx"]) })
          })
        }
      })
    })
  }

  expect_failures = [terraform_data.validate_config_store]
}

run "accepts_advanced_parameter_within_eight_kib" {
  command = plan

  plan_options {
    target = [terraform_data.validate_config_store]
  }

  variables {
    config_store = {
      tier = "Advanced"
    }
    compute_provider_contracts = merge(var.compute_provider_contracts, {
      linux-small = merge(var.compute_provider_contracts.linux-small, {
        capabilities = {
          scale_set = merge(var.compute_provider_contracts.linux-small.capabilities.scale_set, {
            configuration_json = jsonencode({ payload = join("", [for index in range(800) : "xxxxxx"]) })
          })
        }
      })
    })
  }

  assert {
    condition     = local.reconciler_config_bytes["ec2/linux-small"] > 4096 && local.reconciler_config_bytes["ec2/linux-small"] <= 8192
    error_message = "Advanced Parameter Store tier must accept reconciler JSON between four and eight KiB."
  }
}

run "rejects_duplicate_scale_set_ownership_across_groups" {
  command = plan

  plan_options {
    target = [terraform_data.validate_contract]
  }

  variables {
    runner_configs = merge(var.runner_configs, {
      microvm = merge(var.runner_configs.microvm, {
        github = merge(var.runner_configs.microvm.github, {
          config_url = "https://GITHUB.COM:443/example/"
        })
        scale_set = merge(var.runner_configs.microvm.scale_set, {
          id = 101
        })
      })
    })
  }

  expect_failures = [terraform_data.validate_contract]
}

run "rejects_leading_zero_default_port_spelling" {
  command = plan

  plan_options {
    target = [terraform_data.validate_contract]
  }

  variables {
    runner_configs = merge(var.runner_configs, {
      microvm = merge(var.runner_configs.microvm, {
        github = merge(var.runner_configs.microvm.github, {
          config_url = "https://github.com:0443/example/"
        })
        scale_set = merge(var.runner_configs.microvm.scale_set, {
          id = 101
        })
      })
    })
  }

  expect_failures = [terraform_data.validate_contract]
}

run "rejects_port_above_url_maximum" {
  command = plan

  plan_options {
    target = [terraform_data.validate_contract]
  }

  variables {
    runner_configs = merge(var.runner_configs, {
      microvm = merge(var.runner_configs.microvm, {
        github = merge(var.runner_configs.microvm.github, {
          config_url = "https://github.com:65536/example"
        })
      })
    })
  }

  expect_failures = [terraform_data.validate_contract]
}

run "rejects_non_ascii_scale_set_name" {
  command = plan

  plan_options {
    target = [terraform_data.validate_contract]
  }

  variables {
    runner_configs = merge(var.runner_configs, {
      microvm = merge(var.runner_configs.microvm, {
        scale_set = merge(var.runner_configs.microvm.scale_set, {
          name = "microvm-☃"
        })
      })
    })
  }

  expect_failures = [terraform_data.validate_contract]
}

run "rejects_invalid_compute_provider_type_identifier" {
  command = plan

  plan_options {
    target = [terraform_data.validate_contract]
  }

  variables {
    compute_provider_contracts = merge(var.compute_provider_contracts, {
      microvm = merge(var.compute_provider_contracts.microvm, {
        type = "AWS.MicroVM"
      })
    })
  }

  expect_failures = [terraform_data.validate_contract]
}

run "rejects_scale_set_id_above_runtime_integer_maximum" {
  command = plan

  plan_options {
    target = [terraform_data.validate_contract]
  }

  variables {
    runner_configs = merge(var.runner_configs, {
      microvm = merge(var.runner_configs.microvm, {
        scale_set = merge(var.runner_configs.microvm.scale_set, {
          id = 2147483648
        })
      })
    })
  }

  expect_failures = [terraform_data.validate_contract]
}

run "rejects_runner_group_id_above_runtime_integer_maximum" {
  command = plan

  plan_options {
    target = [terraform_data.validate_contract]
  }

  variables {
    runner_configs = merge(var.runner_configs, {
      microvm = merge(var.runner_configs.microvm, {
        scale_set = merge(var.runner_configs.microvm.scale_set, {
          runner_group_id = 2147483648
        })
      })
    })
  }

  expect_failures = [terraform_data.validate_contract]
}

run "rejects_credential_arn_name_mismatch" {
  command = plan

  plan_options {
    target = [terraform_data.validate_contract]
  }

  variables {
    runner_configs = merge(var.runner_configs, {
      microvm = merge(var.runner_configs.microvm, {
        github = merge(var.runner_configs.microvm.github, {
          app = merge(var.runner_configs.microvm.github.app, {
            app_id = merge(var.runner_configs.microvm.github.app.app_id, {
              arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github/another/app-id"
            })
          })
        })
      })
    })
  }

  expect_failures = [terraform_data.validate_contract]
}

run "rejects_cross_account_credential_parameter" {
  command = plan

  plan_options {
    target = [terraform_data.validate_contract]
  }

  variables {
    runner_configs = merge(var.runner_configs, {
      microvm = merge(var.runner_configs.microvm, {
        github = merge(var.runner_configs.microvm.github, {
          app = merge(var.runner_configs.microvm.github.app, {
            app_id = merge(var.runner_configs.microvm.github.app.app_id, {
              arn = "arn:aws:ssm:eu-west-1:210987654321:parameter/github/microvm/app-id"
            })
          })
        })
      })
    })
  }

  expect_failures = [terraform_data.validate_contract]
}

run "allows_same_numeric_scale_set_id_in_another_github_scope" {
  command = plan

  plan_options {
    target = [terraform_data.validate_contract]
  }

  variables {
    runner_configs = merge(var.runner_configs, {
      microvm = merge(var.runner_configs.microvm, {
        scale_set = merge(var.runner_configs.microvm.scale_set, {
          id = 101
        })
      })
    })
  }

  assert {
    condition     = length(local.scale_set_ownership_keys) == length(distinct(local.scale_set_ownership_keys))
    error_message = "Scale-set IDs are scoped to their normalized GitHub configuration URL."
  }
}

run "bounds_default_session_owner_for_maximum_names" {
  command = plan

  variables {
    grouping = {
      strategy = "runner_config"
    }
    runner_configs = {
      (join("", [for index in range(128) : "a"])) = {
        github = {
          config_url = "https://github.com/example"
          app = {
            app_id = {
              name = "/github/max/app-id"
              arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github/max/app-id"
            }
            private_key = {
              name = "/github/max/private-key"
              arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github/max/private-key"
            }
            installation_id = {
              name = "/github/max/installation-id"
              arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github/max/installation-id"
            }
          }
        }
        scale_set = {
          id   = 301
          name = "maximum-name"
        }
      }
    }
    compute_provider_contracts = {
      (join("", [for index in range(128) : "a"])) = {
        type = "ec2"
        capabilities = {
          scale_set = {
            configuration_json = "{}"
          }
        }
      }
    }
  }

  assert {
    condition = (
      length(one(values(local.reconciler_configs)).value.sessionOwner) == 256 &&
      can(regex("^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$", one(values(local.reconciler_configs)).value.sessionOwner))
    )
    error_message = "A generated session owner must remain deterministic and within the runtime's 256-character limit."
  }
}

run "rejects_controller_group_policy_above_inline_quota" {
  command = plan

  plan_options {
    target = [terraform_data.validate_group_task_policy["ec2"]]
  }

  override_data {
    target = data.aws_iam_policy_document.task["ec2"]
    values = {
      json = <<-JSON
        {"payload":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
      JSON
    }
  }

  expect_failures = [terraform_data.validate_group_task_policy["ec2"]]
}

run "rejects_conflicting_group_environment_variables" {
  command = plan

  plan_options {
    target = [terraform_data.validate_contract]
  }

  variables {
    compute_provider_contracts = merge(var.compute_provider_contracts, {
      linux-large = merge(var.compute_provider_contracts.linux-large, {
        capabilities = {
          scale_set = merge(var.compute_provider_contracts.linux-large.capabilities.scale_set, {
            environment_variables = {
              EC2_CONTROLLER_MODE = "isolated"
            }
          })
        }
      })
    })
  }

  expect_failures = [terraform_data.validate_contract]
}

run "rejects_controller_group_environment_above_task_definition_budget" {
  command = plan

  plan_options {
    target = [terraform_data.validate_grouping]
  }

  variables {
    compute_provider_contracts = merge(var.compute_provider_contracts, {
      linux-small = merge(var.compute_provider_contracts.linux-small, {
        capabilities = {
          scale_set = merge(var.compute_provider_contracts.linux-small.capabilities.scale_set, {
            environment_variables = merge(
              var.compute_provider_contracts.linux-small.capabilities.scale_set.environment_variables,
              {
                for index in range(16) : format("EC2_QUOTA_%02d", index) => join("", [for part in range(1024) : "xxxx"])
              },
            )
          })
        }
      })
    })
  }

  expect_failures = [terraform_data.validate_grouping]
}

run "rejects_reserved_provider_environment_variables" {
  command = plan

  plan_options {
    target = [terraform_data.validate_contract]
  }

  variables {
    compute_provider_contracts = merge(var.compute_provider_contracts, {
      linux-small = merge(var.compute_provider_contracts.linux-small, {
        capabilities = {
          scale_set = merge(var.compute_provider_contracts.linux-small.capabilities.scale_set, {
            environment_variables = {
              SCALE_SET_OVERRIDE = "unsafe"
            }
          })
        }
      })
    })
  }

  expect_failures = [terraform_data.validate_contract]
}

run "rejects_invalid_boot_timeout" {
  command = plan

  plan_options {
    target = [terraform_data.validate_contract]
  }

  variables {
    runner_configs = merge(var.runner_configs, {
      linux-small = merge(var.runner_configs.linux-small, {
        scale_set = merge(var.runner_configs.linux-small.scale_set, {
          boot_time_in_minutes = 0
        })
      })
    })
  }

  expect_failures = [terraform_data.validate_contract]
}

run "rejects_controller_group_above_runtime_reconciler_limit" {
  command = plan

  plan_options {
    target = [terraform_data.validate_grouping]
  }

  variables {
    runner_configs = {
      for index in range(1001) : format("runner-%04d", index) => var.runner_configs.linux-small
    }
    compute_provider_contracts = {
      for index in range(1001) : format("runner-%04d", index) => var.compute_provider_contracts.linux-small
    }
    grouping = {
      strategy = "custom"
      custom = {
        groups = {
          oversized = {
            runner_configs = toset([for index in range(1001) : format("runner-%04d", index)])
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_grouping]
}

run "rejects_controller_group_above_runtime_config_bytes" {
  command = plan

  plan_options {
    target = [terraform_data.validate_grouping]
  }

  variables {
    config_store = {
      tier = "Advanced"
    }
    runner_configs = {
      for index in range(900) : format("runner-%04d", index) => var.runner_configs.linux-small
    }
    compute_provider_contracts = {
      for index in range(900) : format("runner-%04d", index) => merge(var.compute_provider_contracts.linux-small, {
        capabilities = {
          scale_set = merge(var.compute_provider_contracts.linux-small.capabilities.scale_set, {
            configuration_json = jsonencode({
              payload = join("", [for part in range(1000) : "xxxxx"])
            })
          })
        }
      })
    }
    grouping = {
      strategy = "custom"
      custom = {
        groups = {
          oversized = {
            runner_configs = toset([for index in range(900) : format("runner-%04d", index)])
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_grouping]
}

run "rejects_runtime_invalid_credential_parameter_name" {
  command = plan

  plan_options {
    target = [terraform_data.validate_contract]
  }

  variables {
    runner_configs = merge(var.runner_configs, {
      microvm = merge(var.runner_configs.microvm, {
        github = merge(var.runner_configs.microvm.github, {
          app = merge(var.runner_configs.microvm.github.app, {
            app_id = {
              name = "/github/microvm/bad app-id"
              arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github/microvm/bad app-id"
            }
          })
        })
      })
    })
  }

  expect_failures = [terraform_data.validate_contract]
}
