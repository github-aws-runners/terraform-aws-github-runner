locals {
  listener_name = length("${var.config.prefix}-scale-set-listener") <= 63 ? "${var.config.prefix}-scale-set-listener" : "${substr("${var.config.prefix}-scale-set-listener", 0, 54)}-${substr(md5("${var.config.prefix}-scale-set-listener"), 0, 8)}"

  task_role_name      = "${substr("${local.listener_name}-task", 0, 54)}-${substr(md5("${local.listener_name}-task"), 0, 8)}"
  execution_role_name = "${substr("${local.listener_name}-execution", 0, 54)}-${substr(md5("${local.listener_name}-execution"), 0, 8)}"
  log_group_name      = "/aws/ecs/${local.listener_name}"

  is_ghec_data_residency = (
    can(regex("^https://[^/]+[.]ghe[.]com(/|$)", lower(var.config.github.config_url))) ||
    can(regex("^https://[^/]+[.]ghe[.]com(/|$)", lower(var.config.github.ghes_url)))
  )

  cluster_arn  = var.config.ecs.cluster != null ? var.config.ecs.cluster.arn : aws_ecs_cluster.listener[0].arn
  cluster_name = element(reverse(split("/", local.cluster_arn)), 0)
  security_group_ids = concat(
    var.config.ecs.security_group_ids,
    var.config.ecs.create_security_group ? [aws_security_group.listener[0].id] : [],
  )

  github_app_id_parameter_names  = join(":", [for parameter in var.config.github.app_parameters.id : parameter.name])
  github_app_key_parameter_names = join(":", [for parameter in var.config.github.app_parameters.key_base64 : parameter.name])
  github_app_installation_parameter_names = join(":", [
    for parameter in var.config.github.app_parameters.installation_id : parameter == null ? "" : parameter.name
  ])

  session_owner = try(trimspace(var.config.scale_set.session_owner), "") != "" ? trimspace(var.config.scale_set.session_owner) : local.listener_name

  parameter_store_tags = jsonencode([
    for key, value in var.config.ssm.parameter_store_tags : {
      Key   = key
      Value = value
    }
  ])

  common_container_environment = {
    COMPUTE_PROVIDER_TYPE                     = var.runner_provider.type
    LOG_LEVEL                                 = upper(var.config.log_level)
    NODE_TLS_REJECT_UNAUTHORIZED              = var.config.github.ghes_url != null && !var.config.github.ssl_verify ? "0" : "1"
    PARAMETER_GITHUB_APP_ID_NAME              = local.github_app_id_parameter_names
    PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME = local.github_app_installation_parameter_names
    PARAMETER_GITHUB_APP_KEY_BASE64_NAME      = local.github_app_key_parameter_names
    POWERTOOLS_LOGGER_LOG_EVENT               = lower(var.config.log_level) == "debug" ? "true" : "false"
    POWERTOOLS_METRICS_NAMESPACE              = "GitHubRunners"
    POWERTOOLS_SERVICE_NAME                   = local.listener_name
    POWERTOOLS_TRACE_ENABLED                  = "false"
    RUNNER_NAME_PREFIX                        = var.config.runner.name_prefix
    SCALE_SET_GITHUB_APP_INDEX                = tostring(var.config.scale_set.github_app_index)
    SCALE_SET_GITHUB_CONFIG_URL               = var.config.github.config_url
    SCALE_SET_HEALTH_PORT                     = "8080"
    SCALE_SET_ID                              = tostring(var.config.scale_set.id)
    SCALE_SET_MAX_RUNNERS                     = tostring(var.config.scale_set.max_runners)
    SCALE_SET_MIN_RUNNERS                     = tostring(var.config.scale_set.min_runners)
    SCALE_SET_SESSION_OWNER                   = local.session_owner
    SCALE_SET_WORK_FOLDER                     = var.config.scale_set.work_folder
    SSM_PARAMETER_STORE_TAGS                  = local.parameter_store_tags
    SSM_TOKEN_PATH                            = var.config.ssm.token_path
    USER_AGENT                                = try(trimspace(var.config.github.user_agent), "") != "" ? trimspace(var.config.github.user_agent) : "github-aws-runners"
  }

  optional_container_environment = merge(
    try(trimspace(var.config.github.ghes_url), "") != "" ? {
      GHES_URL = trimspace(var.config.github.ghes_url)
    } : {},
    var.config.github.force_ghes && !local.is_ghec_data_residency ? {
      GITHUB_ACTIONS_FORCE_GHES = "true"
    } : {},
  )

  # Common control-plane values win if a provider accidentally exports a
  # reserved name. Provider contracts should contribute only provider-specific
  # configuration such as launch-template and capacity settings.
  container_environment = merge(
    var.runner_provider.environment_variables,
    local.common_container_environment,
    local.optional_container_environment,
  )

  container_definition = {
    name                   = "scale-set-listener"
    image                  = var.config.ecs.container_image
    essential              = true
    readonlyRootFilesystem = true
    user                   = "1000:1000"
    stopTimeout            = 120
    environment = [
      for name, value in local.container_environment : {
        name  = name
        value = value
      }
    ]
    healthCheck = {
      command     = ["CMD", "node", "/app/healthcheck.cjs"]
      interval    = var.config.ecs.health_check_interval
      timeout     = var.config.ecs.health_check_timeout
      retries     = var.config.ecs.health_check_retries
      startPeriod = var.config.ecs.health_check_start_period
    }
    linuxParameters = {
      initProcessEnabled = true
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.listener.name
        awslogs-region        = var.config.aws_region
        awslogs-stream-prefix = "listener"
      }
    }
  }

  tags = merge(var.config.tags, {
    Name = local.listener_name
  })
}
