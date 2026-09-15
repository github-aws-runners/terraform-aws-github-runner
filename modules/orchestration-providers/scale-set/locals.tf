locals {
  github_config_urls = {
    for runner_name, runner_config in var.runner_configs : runner_name => format(
      "%s%s",
      trimsuffix(coalesce(runner_config.github.enterprise_server.url, "https://github.com"), "/"),
      runner_config.github.runner_owner == null ? "" : "/${runner_config.github.runner_owner}",
    )
  }
  declared_custom_groups = var.grouping.strategy == "custom" && var.grouping.custom != null ? {
    for group_name, group in var.grouping.custom.groups : group_name => sort(tolist(group.runner_configs))
  } : {}

  controller_groups = (
    var.grouping.strategy == "compute_provider" ? {
      for provider_type in distinct([
        for runner_name in keys(var.runner_configs) : var.runner_configs[runner_name].compute_provider.type
        ]) : provider_type => [
        for runner_name in keys(var.runner_configs) : runner_name
        if var.runner_configs[runner_name].compute_provider.type == provider_type
      ]
    } :
    var.grouping.strategy == "runner_config" ? {
      for runner_name in keys(var.runner_configs) : runner_name => [runner_name]
    } :
    var.grouping.strategy == "custom" ? {
      for group_name, runner_names in local.declared_custom_groups : group_name => [
        for runner_name in runner_names : runner_name
        if contains(keys(var.runner_configs), runner_name)
      ]
    } :
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
          schemaVersion      = 1
          runnerConfigName   = runner_name
          runnerGroupName    = var.runner_configs[runner_name].scale_set.runner.group_name
          runnerLabels       = var.runner_configs[runner_name].scale_set.runner.labels
          githubConfigUrl    = local.github_config_urls[runner_name]
          scaleSetName       = var.runner_configs[runner_name].scale_set.name
          minRunners         = var.runner_configs[runner_name].scale_set.runner.min_runners
          maxRunners         = var.runner_configs[runner_name].scale_set.runner.max_runners
          bootTimeoutMinutes = var.runner_configs[runner_name].scale_set.runner.boot_time_in_minutes
          workFolder         = "_work"
          sslVerify          = var.runner_configs[runner_name].github.enterprise_server.ssl_verify
          forceGhes          = var.runner_configs[runner_name].github.enterprise_server.url != null
          sessionOwner = (
            length("${group_name}.${runner_name}") <= 256
            ? "${group_name}.${runner_name}"
            : "${substr(group_name, 0, 119)}.${substr(runner_name, 0, 119)}.${substr(sha256(format("%s.%s", group_name, runner_name)), 0, 16)}"
          )
          githubApp = {
            appIdParameterName          = var.runner_configs[runner_name].github.app.app_id.name
            privateKeyParameterName     = var.runner_configs[runner_name].github.app.private_key.name
            installationIdParameterName = var.runner_configs[runner_name].github.app.installation_id.name
          }
          computeProvider = {
            type          = var.runner_configs[runner_name].compute_provider.type
            roleArn       = local.compute_role_arns["${group_name}/${runner_name}"]
            configuration = jsondecode(var.runner_configs[runner_name].compute_provider.capabilities.scale_set.configuration_json)
          }
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

  group_controller_manifests = {
    for group_name, runner_names in local.controller_groups : group_name => jsonencode({
      version   = 1
      groupName = group_name
      revision  = local.group_config_revisions[group_name]
      reconcilers = [
        for runner_name in runner_names : local.reconciler_configs["${group_name}/${runner_name}"].value
      ]
    })
  }
  group_github_parameters = {
    for group_name, runner_names in local.controller_groups : group_name => flatten([
      for runner_name in runner_names : [
        {
          arn         = var.runner_configs[runner_name].github.app.app_id.arn
          kms_key_arn = var.runner_configs[runner_name].github.app.app_id.kms_key_arn
        },
        {
          arn         = var.runner_configs[runner_name].github.app.private_key.arn
          kms_key_arn = var.runner_configs[runner_name].github.app.private_key.kms_key_arn
        },
        {
          arn         = var.runner_configs[runner_name].github.app.installation_id.arn
          kms_key_arn = var.runner_configs[runner_name].github.app.installation_id.kms_key_arn
        },
      ]
    ])
  }

  group_github_kms_policy_json = {
    for group_name, parameters in local.group_github_parameters : group_name => jsonencode({
      Version = "2012-10-17"
      Statement = length(compact([for parameter in parameters : parameter.kms_key_arn])) == 0 ? [] : [{
        Sid      = "DecryptGitHubAppParameters"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = distinct(compact([for parameter in parameters : parameter.kms_key_arn]))
      }]
    })
  }

  compute_role_configs = {
    for config_key in flatten([
      for group_name, runner_names in local.controller_groups : [
        for runner_name in runner_names : {
          key         = "${group_name}/${runner_name}"
          group_name  = group_name
          runner_name = runner_name
        }
      ]
    ]) : config_key.key => config_key
    if var.runner_configs[config_key.runner_name].compute_provider.capabilities.scale_set.role_arn == null
  }

  compute_role_arns = {
    for config in flatten([
      for group_name, runner_names in local.controller_groups : [
        for runner_name in runner_names : {
          key         = "${group_name}/${runner_name}"
          group_name  = group_name
          runner_name = runner_name
        }
      ]
      ]) : config.key => (
      var.runner_configs[config.runner_name].compute_provider.capabilities.scale_set.role_arn != null
      ? var.runner_configs[config.runner_name].compute_provider.capabilities.scale_set.role_arn
      : format(
        "arn:%s:iam::%s:role%s%s-compute-%s",
        data.aws_partition.current.partition,
        data.aws_caller_identity.current.account_id,
        var.ecs.iam.path,
        local.group_resource_names[config.group_name],
        substr(sha256(config.key), 0, 8),
      )
    )
  }

  reconciler_compute_iam_statements = {
    for config_key, config in local.compute_role_configs : config_key => {
      for statement_name, statement in var.runner_configs[config.runner_name].compute_provider.capabilities.scale_set.iam_statements :
      statement_name => statement
    }
  }

  group_compute_environment_entries = {
    for group_name, runner_names in local.controller_groups : group_name => flatten([
      for runner_name in runner_names : [
        for name, value in var.runner_configs[runner_name].compute_provider.capabilities.scale_set.environment_variables : {
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

  config_store_max_bytes = var.config_store.tier == "Advanced" ? 8192 : 4096

  reconciler_config_json = {
    for config_key, config in local.reconciler_configs : config_key => jsonencode(config.value)
  }
  reconciler_config_bytes = {
    for config_key, config_json in local.reconciler_config_json : config_key => (
      floor(length(base64encode(config_json)) * 3 / 4) -
      (endswith(base64encode(config_json), "==") ? 2 : endswith(base64encode(config_json), "=") ? 1 : 0)
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
