locals {
  configured_runner_names = toset(keys(var.runner_configs))
  contract_runner_names   = toset(keys(var.compute_provider_contracts))
  routable_runner_names   = sort(tolist(setintersection(local.configured_runner_names, local.contract_runner_names)))

  normalized_github_config_urls = {
    for runner_name, runner_config in var.runner_configs : runner_name => replace(
      trimsuffix(lower(runner_config.github.config_url), "/"),
      ":443/",
      "/",
    )
  }
  github_config_url_ports = {
    for runner_name, runner_config in var.runner_configs : runner_name => try(
      tonumber(regex("^https://[A-Za-z0-9.-]+:([0-9]+)/", runner_config.github.config_url)[0]),
      443,
    )
  }
  scale_set_ownership_keys = [
    for runner_name, runner_config in var.runner_configs :
    "${local.normalized_github_config_urls[runner_name]}#${runner_config.scale_set.id}"
  ]

  declared_custom_groups = var.grouping.strategy == "custom" && var.grouping.custom != null ? {
    for group_name, group in var.grouping.custom.groups : group_name => sort(tolist(group.runner_configs))
  } : {}

  custom_members = flatten(values(local.declared_custom_groups))

  compute_provider_types = distinct([
    for runner_name in local.routable_runner_names : var.compute_provider_contracts[runner_name].type
  ])

  compute_provider_groups = {
    for provider_type in local.compute_provider_types : provider_type => [
      for runner_name in local.routable_runner_names : runner_name
      if var.compute_provider_contracts[runner_name].type == provider_type
    ]
  }

  runner_config_groups = {
    for runner_name in local.routable_runner_names : runner_name => [runner_name]
  }

  custom_groups = {
    for group_name, runner_names in local.declared_custom_groups : group_name => [
      for runner_name in runner_names : runner_name
      if contains(local.routable_runner_names, runner_name)
    ]
  }

  controller_groups = (
    var.grouping.strategy == "compute_provider" ? local.compute_provider_groups :
    var.grouping.strategy == "runner_config" ? local.runner_config_groups :
    var.grouping.strategy == "custom" ? local.custom_groups :
    {}
  )

  group_resource_names = {
    for group_name in keys(local.controller_groups) : group_name => format(
      "%s-ss-%s-%s",
      var.prefix,
      substr(replace(lower(group_name), "/[^a-z0-9_-]/", "-"), 0, 20),
      substr(sha256(group_name), 0, 8),
    )
  }

  official_container_image = "ghcr.io/github-aws-runners/terraform-aws-github-runner-scale-set-service:latest"
  resolved_container_image = coalesce(var.container.image, local.official_container_image)

  resolved_health_check_command = var.container.health_check_command != null ? var.container.health_check_command : [
    "CMD",
    "node",
    "-e",
    "fetch('http://127.0.0.1:${var.container.health_port}${var.container.health_path}').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
  ]

  reconciler_configs = merge([
    for group_name, runner_names in local.controller_groups : {
      for runner_name in runner_names : "${group_name}/${runner_name}" => {
        group_name  = group_name
        runner_name = runner_name
        value = merge({
          schemaVersion         = 1
          runnerConfigName      = runner_name
          githubConfigUrl       = var.runner_configs[runner_name].github.config_url
          scaleSetId            = var.runner_configs[runner_name].scale_set.id
          expectedScaleSetName  = var.runner_configs[runner_name].scale_set.name
          expectedRunnerGroupId = var.runner_configs[runner_name].scale_set.runner_group_id
          minRunners            = var.runner_configs[runner_name].scale_set.min_runners
          maxRunners            = var.runner_configs[runner_name].scale_set.max_runners
          bootTimeoutMinutes    = var.runner_configs[runner_name].scale_set.boot_time_in_minutes
          sslVerify             = var.runner_configs[runner_name].github.ssl_verify
          sessionOwner = (
            var.runner_configs[runner_name].scale_set.session_owner != null
            ? var.runner_configs[runner_name].scale_set.session_owner
            : length("${group_name}.${runner_name}") <= 256
            ? "${group_name}.${runner_name}"
            : "${substr(group_name, 0, 119)}.${substr(runner_name, 0, 119)}.${substr(sha256(format("%s.%s", group_name, runner_name)), 0, 16)}"
          )
          githubApp = {
            appIdParameterName          = var.runner_configs[runner_name].github.app.app_id.name
            privateKeyParameterName     = var.runner_configs[runner_name].github.app.private_key.name
            installationIdParameterName = var.runner_configs[runner_name].github.app.installation_id.name
          }
          computeProvider = {
            type          = var.compute_provider_contracts[runner_name].type
            configuration = jsondecode(var.compute_provider_contracts[runner_name].capabilities.scale_set.configuration_json)
          }
          }, var.runner_configs[runner_name].work_folder == null ? {} : {
          workFolder = var.runner_configs[runner_name].work_folder
          }, var.runner_configs[runner_name].github.force_ghes == null ? {} : {
          forceGhes = var.runner_configs[runner_name].github.force_ghes
          }, var.runner_configs[runner_name].github.user_agent == null ? {} : {
          userAgent = var.runner_configs[runner_name].github.user_agent
        })
      }
    }
  ]...)

  config_store_path_prefix = coalesce(var.config_store.path_prefix, "/${var.prefix}/scale-set-controller")
  group_config_paths = {
    for group_name in keys(local.controller_groups) : group_name => "${local.config_store_path_prefix}/${group_name}"
  }
  group_config_revisions = {
    for group_name, runner_names in local.controller_groups : group_name => sha256(jsonencode({
      for runner_name in runner_names : runner_name => local.reconciler_configs["${group_name}/${runner_name}"].value
    }))
  }

  group_ssm_parameter_arns = {
    for group_name, runner_names in local.controller_groups : group_name => flatten([
      for runner_name in runner_names : [
        var.runner_configs[runner_name].github.app.app_id.arn,
        var.runner_configs[runner_name].github.app.private_key.arn,
        var.runner_configs[runner_name].github.app.installation_id.arn,
      ]
    ])
  }

  group_ssm_kms_key_arns = {
    for group_name, runner_names in local.controller_groups : group_name => flatten([
      for runner_name in runner_names : [
        for parameter in [
          var.runner_configs[runner_name].github.app.app_id,
          var.runner_configs[runner_name].github.app.private_key,
          var.runner_configs[runner_name].github.app.installation_id,
        ] : parameter.kms_key_arn
      ]
    ])
  }

  group_github_kms_policy_json = {
    for group_name, kms_key_arns in local.group_ssm_kms_key_arns : group_name => jsonencode({
      Version = "2012-10-17"
      Statement = length(compact(kms_key_arns)) == 0 ? [] : [{
        Sid      = "DecryptGitHubAppParameters"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = distinct(compact(kms_key_arns))
      }]
    })
  }

  group_compute_iam_statements = {
    for group_name, runner_names in local.controller_groups : group_name => merge([
      for runner_name in runner_names : {
        for statement_name, statement in var.compute_provider_contracts[runner_name].capabilities.scale_set.iam_statements :
        "${runner_name}/${statement_name}" => statement
      }
    ]...)
  }

  group_compute_environment_entries = {
    for group_name, runner_names in local.controller_groups : group_name => flatten([
      for runner_name in runner_names : [
        for name, value in var.compute_provider_contracts[runner_name].capabilities.scale_set.environment_variables : {
          runner_name = runner_name
          name        = name
          value       = value
        }
      ]
    ])
  }

  group_compute_environment_variables = {
    for group_name, entries in local.group_compute_environment_entries : group_name => merge([
      for entry in entries : { (entry.name) = entry.value }
    ]...)
  }

  reserved_environment_variable_names = toset([
    "PATH",
    "HOME",
    "HOSTNAME",
    "PWD",
    "SHLVL",
  ])

  config_store_max_bytes = var.config_store.tier == "Advanced" ? 8192 : 4096

  reconciler_config_json = {
    for config_key, config in local.reconciler_configs : config_key => jsonencode(config.value)
  }
  reconciler_config_base64 = {
    for config_key, config_json in local.reconciler_config_json : config_key => base64encode(config_json)
  }
  reconciler_config_bytes = {
    for config_key, encoded in local.reconciler_config_base64 : config_key => (
      floor(length(encoded) * 3 / 4) -
      (endswith(encoded, "==") ? 2 : endswith(encoded, "=") ? 1 : 0)
    )
  }
  group_reconciler_config_bytes = {
    for group_name, runner_names in local.controller_groups : group_name => sum([
      for runner_name in runner_names : local.reconciler_config_bytes["${group_name}/${runner_name}"]
    ])
  }

  group_task_policy_base64 = {
    for group_name, policy in data.aws_iam_policy_document.task : group_name => base64encode(policy.json)
  }
  group_task_policy_bytes = {
    for group_name, encoded in local.group_task_policy_base64 : group_name => (
      floor(length(encoded) * 3 / 4) -
      (endswith(encoded, "==") ? 2 : endswith(encoded, "=") ? 1 : 0)
    )
  }

  cluster_arn = var.ecs.cluster.mode == "managed" ? aws_ecs_cluster.controller[0].arn : var.ecs.cluster.arn

  group_config_path_arns = {
    for group_name, config_path in local.group_config_paths : group_name => format(
      "arn:%s:ssm:%s:%s:parameter%s/*",
      data.aws_partition.current.partition,
      data.aws_region.current.region,
      data.aws_caller_identity.current.account_id,
      config_path,
    )
  }

  fargate_memory_by_cpu = {
    256   = [512, 1024, 2048]
    512   = [1024, 2048, 3072, 4096]
    1024  = range(2048, 9216, 1024)
    2048  = range(4096, 17408, 1024)
    4096  = range(8192, 31744, 1024)
    8192  = range(16384, 65536, 4096)
    16384 = range(32768, 131072, 8192)
  }

  common_tags = merge(
    {
      "ghr:component" = "scale-set-controller"
    },
    var.tags,
  )

  group_tags = {
    for group_name, resource_name in local.group_resource_names : group_name => merge(
      local.common_tags,
      {
        Name                   = resource_name
        "ghr:controller-group" = group_name
      },
    )
  }
}
