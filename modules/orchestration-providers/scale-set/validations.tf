locals {
  group_compute_environment_base64 = {
    for group_name, environment_variables in local.group_compute_environment_variables : group_name => base64encode(jsonencode([
      for name in sort(keys(environment_variables)) : {
        name  = name
        value = environment_variables[name]
      }
    ]))
  }
  group_compute_environment_bytes = {
    for group_name, encoded in local.group_compute_environment_base64 : group_name => (
      floor(length(encoded) * 3 / 4) -
      (endswith(encoded, "==") ? 2 : endswith(encoded, "=") ? 1 : 0)
    )
  }
}

resource "terraform_data" "validate_contract" {
  lifecycle {
    precondition {
      condition = (
        length(var.prefix) >= 1 &&
        length(var.prefix) <= 20 &&
        can(regex("^[a-z0-9][a-z0-9-]*$", var.prefix))
      )
      error_message = "prefix must contain 1 to 20 lowercase ASCII letters, digits, or hyphens and start with a letter or digit."
    }

    precondition {
      condition = (
        length(setsubtract(local.configured_runner_names, local.contract_runner_names)) == 0 &&
        length(setsubtract(local.contract_runner_names, local.configured_runner_names)) == 0
      )
      error_message = "runner_configs and compute_provider_contracts must have exactly the same keys."
    }

    precondition {
      condition = alltrue([
        for runner_name in keys(var.runner_configs) : (
          length(runner_name) >= 1 &&
          length(runner_name) <= 128 &&
          can(regex("^[A-Za-z0-9][A-Za-z0-9._-]*$", runner_name))
        )
      ])
      error_message = "runner-config keys must contain 1 to 128 ASCII letters, digits, dots, underscores, or hyphens and start with a letter or digit."
    }

    precondition {
      condition = alltrue([
        for runner_name, runner_config in var.runner_configs : (
          can(regex("^https://[A-Za-z0-9.-]+(:[1-9][0-9]{0,4})?/[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)?/?$", runner_config.github.config_url)) &&
          local.github_config_url_ports[runner_name] <= 65535
        )
      ])
      error_message = "Each github.config_url must be an HTTPS GitHub organization, repository, or enterprise URL without credentials, query, fragment, or whitespace."
    }

    precondition {
      condition     = length(local.scale_set_ownership_keys) == length(distinct(local.scale_set_ownership_keys))
      error_message = "Each normalized github.config_url and scale_set.id tuple must be unique across runner_configs so two controller services cannot own the same message session. URL matching ignores case, one trailing slash, and the default HTTPS port."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(var.runner_configs) : (
          alltrue([
            for parameter in [
              runner_config.github.app.app_id,
              runner_config.github.app.private_key,
              runner_config.github.app.installation_id,
              ] : (
              length(parameter.name) <= 2048 &&
              can(regex("^/[A-Za-z0-9_./-]+$", parameter.name)) &&
              !endswith(parameter.name, "/") &&
              !strcontains(parameter.name, "//") &&
              parameter.arn == format(
                "arn:%s:ssm:%s:%s:parameter%s",
                data.aws_partition.current.partition,
                data.aws_region.current.region,
                data.aws_caller_identity.current.account_id,
                parameter.name,
              ) &&
              (parameter.kms_key_arn == null ? true : can(regex("^arn:[^:]+:kms:[^:]+:[0-9]{12}:key/.+$", parameter.kms_key_arn)))
            )
          ])
        )
      ])
      error_message = "GitHub App credentials must use valid absolute SSM parameter names and exact same-account, same-region parameter ARNs; optional KMS references must be key ARNs."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(var.runner_configs) : (
          can(regex("^[ -~]{1,128}$", runner_config.scale_set.name)) &&
          runner_config.scale_set.id >= 1 &&
          runner_config.scale_set.id <= 2147483647 &&
          floor(runner_config.scale_set.id) == runner_config.scale_set.id &&
          (runner_config.scale_set.runner_group_id == null ? true : (
            runner_config.scale_set.runner_group_id >= 1 &&
            runner_config.scale_set.runner_group_id <= 2147483647 &&
            floor(runner_config.scale_set.runner_group_id) == runner_config.scale_set.runner_group_id
          )) &&
          runner_config.scale_set.min_runners >= 0 &&
          floor(runner_config.scale_set.min_runners) == runner_config.scale_set.min_runners &&
          runner_config.scale_set.max_runners >= 1 &&
          runner_config.scale_set.max_runners <= 10000 &&
          floor(runner_config.scale_set.max_runners) == runner_config.scale_set.max_runners &&
          runner_config.scale_set.min_runners <= runner_config.scale_set.max_runners &&
          runner_config.scale_set.boot_time_in_minutes >= 1 &&
          runner_config.scale_set.boot_time_in_minutes <= 120 &&
          floor(runner_config.scale_set.boot_time_in_minutes) == runner_config.scale_set.boot_time_in_minutes &&
          (runner_config.scale_set.session_owner == null ? true : can(regex("^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$", runner_config.scale_set.session_owner))) &&
          (runner_config.work_folder == null ? true : (
            length(runner_config.work_folder) <= 128 &&
            !startswith(runner_config.work_folder, "/") &&
            !strcontains(runner_config.work_folder, "\\") &&
            can(regex("^[A-Za-z0-9._/-]+$", runner_config.work_folder)) &&
            alltrue([for part in split("/", runner_config.work_folder) : !contains(["", ".", ".."], part)])
          )) &&
          (runner_config.github.user_agent == null ? true : (
            length(runner_config.github.user_agent) <= 256 &&
            can(regex("^[ -~]+$", runner_config.github.user_agent))
          ))
        )
      ])
      error_message = "Scale-set names and IDs must be valid, boot_time_in_minutes must be an integer from 1 through 120, optional session/work-folder/user-agent values must match runtime constraints, and min_runners must be between zero and max_runners (maximum 10000)."
    }

    precondition {
      condition = alltrue([
        for contract in values(var.compute_provider_contracts) : (
          can(regex("^[a-z][a-z0-9_-]{0,63}$", contract.type)) &&
          can(keys(jsondecode(contract.capabilities.scale_set.configuration_json))) &&
          length(contract.capabilities.scale_set.environment_variables) <= 64 &&
          alltrue([
            for name, value in contract.capabilities.scale_set.environment_variables : (
              can(regex("^[A-Z][A-Z0-9_]{0,127}$", name)) &&
              !contains(local.reserved_environment_variable_names, name) &&
              alltrue([
                for prefix in ["AWS_", "ECS_", "GITHUB_", "SCALE_SET_", "NODE_"] :
                !startswith(name, prefix)
              ]) &&
              length(regexall("[\\x00-\\x1F\\x7F]", value)) == 0 &&
              (
                floor(length(base64encode(value)) * 3 / 4) -
                (endswith(base64encode(value), "==") ? 2 : endswith(base64encode(value), "=") ? 1 : 0)
              ) <= 4096
            )
          ]) &&
          alltrue([
            for statement_name, statement in contract.capabilities.scale_set.iam_statements : (
              can(regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$", statement_name)) &&
              length(statement.actions) > 0 &&
              length(statement.resources) > 0 &&
              alltrue([for action in statement.actions : !strcontains(action, "*")]) &&
              alltrue([
                for condition in statement.conditions : (
                  length(condition.test) > 0 &&
                  length(condition.variable) > 0 &&
                  length(condition.values) > 0
                )
              ])
            )
          ])
        )
      ])
      error_message = "Each compute-provider scale-set capability must have safe identifiers, object-shaped configuration JSON, non-secret environment variables with safe unreserved names and bounded values, and non-empty least-privilege IAM statements without wildcard actions."
    }

    precondition {
      condition = alltrue([
        for group_name, entries in local.group_compute_environment_entries : alltrue([
          for name in distinct([for entry in entries : entry.name]) :
          length(distinct([for entry in entries : entry.value if entry.name == name])) <= 1
        ])
      ])
      error_message = "Compute-provider environment variables grouped into the same controller task must use identical values for duplicate names. Use a different grouping strategy when providers require conflicting process settings."
    }
  }
}

resource "terraform_data" "validate_grouping" {
  lifecycle {
    precondition {
      condition     = contains(["compute_provider", "runner_config", "custom"], var.grouping.strategy)
      error_message = "grouping.strategy must be compute_provider, runner_config, or custom."
    }

    precondition {
      condition = (
        var.grouping.strategy == "custom"
        ? var.grouping.custom != null && length(var.grouping.custom.groups) > 0
        : var.grouping.custom == null
      )
      error_message = "grouping.custom must be non-null and non-empty only when grouping.strategy is custom."
    }

    precondition {
      condition = var.grouping.strategy != "custom" ? true : alltrue([
        for group_name, group in var.grouping.custom.groups : (
          can(regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$", group_name)) &&
          length(group.runner_configs) > 0
        )
      ])
      error_message = "Custom group names must be stable, safe identifiers of at most 64 characters, and every group must contain at least one runner config."
    }

    precondition {
      condition = var.grouping.strategy != "custom" ? true : (
        length(local.custom_members) == length(distinct(local.custom_members)) &&
        length(setsubtract(toset(local.custom_members), local.configured_runner_names)) == 0 &&
        length(setsubtract(local.configured_runner_names, toset(local.custom_members))) == 0
      )
      error_message = "Custom groups must contain every runner config exactly once and cannot contain unknown runner configs."
    }

    precondition {
      condition = alltrue([
        for group_name, runner_names in local.controller_groups : (
          can(regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$", group_name)) &&
          length(runner_names) > 0 &&
          length(runner_names) <= 1000
        )
      ])
      error_message = "Resolved controller groups must have safe, non-empty, plan-known names and contain at most 1000 runner configs."
    }

    precondition {
      condition = alltrue([
        for group_name, decoded_bytes in local.group_reconciler_config_bytes : decoded_bytes <= 4 * 1024 * 1024
      ])
      error_message = "A controller group's decoded reconciler configuration must not exceed the runtime's 4 MiB aggregate limit. Split the group or reduce provider configuration size."
    }

    precondition {
      condition = alltrue([
        for group_name, environment_bytes in local.group_compute_environment_bytes : environment_bytes <= 48 * 1024
      ])
      error_message = "A controller group's compute-provider environment JSON must not exceed 49152 bytes. This reserves 16 KiB of AWS's 64 KiB ECS task-definition quota for the fixed task definition; split the group or reduce provider environment settings."
    }
  }
}

resource "terraform_data" "validate_runtime" {
  lifecycle {
    precondition {
      condition = (
        var.container.image == null ? true : (
          length(trimspace(var.container.image)) > 0 &&
          length(regexall("[[:space:]]", var.container.image)) == 0
      ))
      error_message = "Container image references must be non-empty and cannot contain whitespace."
    }

    precondition {
      condition = (
        can(regex("^[1-9][0-9]{0,9}(:[1-9][0-9]{0,9})?$", var.container.user)) &&
        var.container.health_port >= 1 && var.container.health_port <= 65535 &&
        (var.container.health_check_command == null ? true : (
          length(var.container.health_check_command) >= 2 &&
          contains(["CMD", "CMD-SHELL"], var.container.health_check_command[0])
        ))
      )
      error_message = "The container must use a numeric non-root UID (and optional GID), a valid health port, and a valid ECS health-check command."
    }

    precondition {
      condition     = var.container.health_path == "/healthz"
      error_message = "container.health_path must be /healthz, the scale-set service liveness endpoint."
    }

    precondition {
      condition = (
        var.container.health_check_interval >= 5 && var.container.health_check_interval <= 300 &&
        var.container.health_check_timeout >= 2 && var.container.health_check_timeout <= 60 &&
        var.container.health_check_timeout < var.container.health_check_interval &&
        var.container.health_check_retries >= 1 && var.container.health_check_retries <= 10 &&
        var.container.health_check_start_period >= 0 && var.container.health_check_start_period <= 300 &&
        var.container.health_stale_after_seconds >= 30 && var.container.health_stale_after_seconds <= 3600 &&
        var.container.shutdown_timeout_seconds >= 1 && var.container.shutdown_timeout_seconds <= 119 &&
        var.container.session_close_timeout_seconds >= 1 && var.container.session_close_timeout_seconds <= 60 &&
        var.container.reconnect_initial_backoff_seconds >= 1 && var.container.reconnect_initial_backoff_seconds <= 300 &&
        var.container.reconnect_max_backoff_seconds >= 1 && var.container.reconnect_max_backoff_seconds <= 3600 &&
        var.container.reconnect_initial_backoff_seconds <= var.container.reconnect_max_backoff_seconds &&
        var.container.stop_timeout_seconds >= 2 && var.container.stop_timeout_seconds <= 120 &&
        var.container.shutdown_timeout_seconds < var.container.stop_timeout_seconds
      )
      error_message = "Container health and shutdown timings must be within ECS limits, with health timeout below interval and application shutdown below task stop timeout."
    }

    precondition {
      condition = (
        contains(keys(local.fargate_memory_by_cpu), tostring(var.ecs.task.cpu)) &&
        contains(lookup(local.fargate_memory_by_cpu, tostring(var.ecs.task.cpu), []), var.ecs.task.memory)
      )
      error_message = "ecs.task.cpu and ecs.task.memory must be a supported Fargate CPU/memory combination."
    }

    precondition {
      condition = (
        contains(["X86_64", "ARM64"], var.ecs.task.cpu_architecture) &&
        (var.ecs.task.ephemeral_storage == null ? true : (
          var.ecs.task.ephemeral_storage.size_in_gib >= 21 && var.ecs.task.ephemeral_storage.size_in_gib <= 200
        ))
      )
      error_message = "ecs.task.cpu_architecture must be X86_64 or ARM64, and optional ephemeral storage must be between 21 and 200 GiB."
    }

    precondition {
      condition = (
        contains(["managed", "external"], var.ecs.cluster.mode) &&
        (var.ecs.cluster.mode == "external" ? (
          var.ecs.cluster.arn != null && can(regex("^arn:[^:]+:ecs:[^:]+:[0-9]{12}:cluster/.+$", var.ecs.cluster.arn))
          ) : (
          var.ecs.cluster.arn == null &&
          (var.ecs.cluster.name == null ? true : can(regex("^[A-Za-z0-9_-]{1,255}$", var.ecs.cluster.name)))
        ))
      )
      error_message = "Use a valid external ECS cluster ARN only with cluster.mode external; managed cluster names may contain letters, digits, underscores, and hyphens."
    }

    precondition {
      condition = (
        startswith(var.ecs.iam.path, "/") &&
        endswith(var.ecs.iam.path, "/") &&
        length(var.ecs.iam.path) <= 512
      )
      error_message = "ecs.iam.path must start and end with a slash and be at most 512 characters."
    }

    precondition {
      condition = (
        length(var.network.vpc_id) > 0 &&
        length(var.network.subnet_ids) > 0 &&
        length(var.network.https_egress.ipv4_cidrs) + length(var.network.https_egress.ipv6_cidrs) > 0 &&
        alltrue([for cidr in var.network.https_egress.ipv4_cidrs : can(cidrnetmask(cidr))]) &&
        alltrue([for cidr in var.network.https_egress.ipv6_cidrs : can(cidrhost(cidr, 0)) && strcontains(cidr, ":")])
      )
      error_message = "network must select a VPC and at least one subnet, and HTTPS egress must contain valid IPv4 or IPv6 CIDRs."
    }

    precondition {
      condition = (
        contains(["STANDARD", "INFREQUENT_ACCESS"], var.logging.log_group_class) &&
        contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653], var.logging.retention_in_days) &&
        (var.logging.kms_key_arn == null ? true : can(regex("^arn:[^:]+:kms:[^:]+:[0-9]{12}:key/.+$", var.logging.kms_key_arn)))
      )
      error_message = "logging must use a supported class and retention period; kms_key_arn must be a KMS key ARN when set."
    }
  }
}

resource "terraform_data" "validate_config_store" {
  lifecycle {
    precondition {
      condition = (
        contains(["Standard", "Advanced"], var.config_store.tier) &&
        startswith(local.config_store_path_prefix, "/") &&
        !endswith(local.config_store_path_prefix, "/") &&
        length(local.config_store_path_prefix) >= 2 &&
        can(regex("^/[A-Za-z0-9_.\\/-]+$", local.config_store_path_prefix))
      )
      error_message = "config_store must use Standard or Advanced tier and a valid absolute SSM path prefix without a trailing slash."
    }

    precondition {
      condition = alltrue([
        for config_key, config in local.reconciler_configs : (
          length("${local.config_store_path_prefix}/${config.group_name}/${config.runner_name}") <= 1011 &&
          local.reconciler_config_bytes[config_key] <= local.config_store_max_bytes
        )
      ])
      error_message = "Each reconciler SSM parameter name and encoded JSON value must fit the selected Parameter Store tier. Split large controller groups or reduce provider configuration when necessary."
    }
  }
}

resource "terraform_data" "validate_group_task_policy" {
  for_each = local.controller_groups

  lifecycle {
    precondition {
      condition     = local.group_task_policy_bytes[each.key] <= 10240
      error_message = "Controller group ${each.key} produces a ${local.group_task_policy_bytes[each.key]}-byte task-role policy, exceeding AWS's 10240-byte inline role-policy quota. Split the group or reduce provider IAM statements."
    }
  }
}
