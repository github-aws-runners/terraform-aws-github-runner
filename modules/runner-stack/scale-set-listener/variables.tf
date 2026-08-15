variable "config" {
  description = <<-EOT
    Provider-neutral configuration for one continuously running GitHub Actions
    runner scale-set listener. GitHub App credentials remain in SSM Parameter
    Store; only parameter names are exposed to the container.
  EOT

  type = object({
    prefix        = string
    aws_region    = string
    aws_partition = optional(string, "aws")
    tags          = optional(map(string), {})
    log_level     = optional(string, "info")

    github = object({
      config_url  = string
      ghes_url    = optional(string, null)
      force_ghes  = optional(bool, false)
      ssl_verify  = optional(bool, true)
      user_agent  = optional(string, null)
      kms_key_arn = optional(string, null)
      app_parameters = object({
        id              = list(object({ name = string, arn = string }))
        key_base64      = list(object({ name = string, arn = string }))
        installation_id = list(object({ name = string, arn = string }))
      })
    })

    scale_set = object({
      id               = number
      min_runners      = optional(number, 0)
      max_runners      = number
      github_app_index = optional(number, 0)
      session_owner    = optional(string, null)
      work_folder      = optional(string, "_work")
    })

    runner = object({
      name_prefix = optional(string, "")
    })

    ssm = object({
      token_path           = string
      token_path_arn       = string
      parameter_store_tags = optional(map(string), {})
    })

    ecs = object({
      container_image         = string
      vpc_id                  = string
      subnet_ids              = list(string)
      security_group_ids      = optional(list(string), [])
      create_security_group   = optional(bool, true)
      egress_ipv4_cidr_blocks = optional(list(string), ["0.0.0.0/0"])
      egress_ipv6_cidr_blocks = optional(list(string), [])
      assign_public_ip        = optional(bool, false)
      cluster = optional(object({
        arn = string
      }), null)
      cpu                       = optional(number, 256)
      memory                    = optional(number, 512)
      architecture              = optional(string, "x86_64")
      platform_version          = optional(string, "LATEST")
      health_check_interval     = optional(number, 30)
      health_check_timeout      = optional(number, 5)
      health_check_retries      = optional(number, 3)
      health_check_start_period = optional(number, 30)
    })

    logging = optional(object({
      retention_in_days = optional(number, 180)
      kms_key_id        = optional(string, null)
      log_class         = optional(string, "STANDARD")
    }), {})

    iam = optional(object({
      role_path            = optional(string, null)
      permissions_boundary = optional(string, null)
    }), {})

    alarm = optional(object({
      enabled    = optional(bool, false)
      actions    = optional(list(string), [])
      ok_actions = optional(list(string), [])
    }), {})
  })

  validation {
    condition     = trimspace(var.config.prefix) != "" && trimspace(var.config.aws_region) != ""
    error_message = "config.prefix and config.aws_region must be non-empty."
  }

  validation {
    condition = (
      length(var.config.github.app_parameters.id) > 0 &&
      length(var.config.github.app_parameters.id) == length(var.config.github.app_parameters.key_base64) &&
      length(var.config.github.app_parameters.id) == length(var.config.github.app_parameters.installation_id)
    )
    error_message = "GitHub App ID, key, and installation-ID parameter lists must be non-empty and have matching lengths. Use null installation-ID list elements when IDs must be discovered."
  }

  validation {
    condition = (
      var.config.scale_set.id > 0 &&
      floor(var.config.scale_set.id) == var.config.scale_set.id &&
      var.config.scale_set.min_runners >= 0 &&
      floor(var.config.scale_set.min_runners) == var.config.scale_set.min_runners &&
      var.config.scale_set.max_runners >= var.config.scale_set.min_runners &&
      floor(var.config.scale_set.max_runners) == var.config.scale_set.max_runners &&
      var.config.scale_set.max_runners <= 2147483647 &&
      var.config.scale_set.github_app_index >= 0 &&
      floor(var.config.scale_set.github_app_index) == var.config.scale_set.github_app_index &&
      var.config.scale_set.github_app_index < length(var.config.github.app_parameters.id)
    )
    error_message = "Scale-set ID, capacity, and GitHub App index must be integers satisfying id > 0, 0 <= min_runners <= max_runners <= 2147483647, and github_app_index must select a configured GitHub App."
  }

  validation {
    condition     = can(regex("^[^@ ]+@sha256:[0-9a-fA-F]{64}$", var.config.ecs.container_image))
    error_message = "config.ecs.container_image must be an immutable image reference ending in @sha256:<64 hex characters>."
  }

  validation {
    condition = (
      can(regex("^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:([1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5]))?/[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)?/?$", trimspace(var.config.github.config_url))) &&
      !can(regex("^https://[^/]+:443/", lower(trimspace(var.config.github.config_url)))) &&
      !can(regex("^https://[^/]+/enterprises/", lower(trimspace(var.config.github.config_url)))) &&
      trimspace(var.config.ssm.token_path) != "" &&
      trimspace(var.config.ssm.token_path_arn) != "" &&
      trimspace(var.config.ecs.vpc_id) != "" &&
      length(var.config.ecs.subnet_ids) > 0 &&
      alltrue([for subnet_id in var.config.ecs.subnet_ids : trimspace(subnet_id) != ""])
    )
    error_message = "GitHub config URL must be a canonical HTTPS organization/repository URL with an optional non-default port from 1 to 65535; the SSM token path/ARN, ECS VPC, and every ECS subnet must be non-empty."
  }

  validation {
    condition = (
      var.config.ecs.create_security_group ||
      length(var.config.ecs.security_group_ids) > 0
    )
    error_message = "At least one external ECS security group is required when create_security_group is false."
  }

  validation {
    condition = (
      var.config.ecs.cluster == null ||
      can(regex("^arn:[^:]+:ecs:[^:]+:[0-9]{12}:cluster/.+$", var.config.ecs.cluster.arn))
    )
    error_message = "config.ecs.cluster.arn must be an ECS cluster ARN when config.ecs.cluster is set."
  }

  validation {
    condition     = contains(["arm64", "x86_64"], var.config.ecs.architecture)
    error_message = "config.ecs.architecture must be arm64 or x86_64."
  }

  validation {
    condition = (
      floor(var.config.ecs.cpu) == var.config.ecs.cpu &&
      var.config.ecs.cpu > 0 &&
      floor(var.config.ecs.memory) == var.config.ecs.memory &&
      var.config.ecs.memory > 0
    )
    error_message = "ECS CPU and memory must be positive integer values."
  }

  validation {
    condition     = contains(["STANDARD", "INFREQUENT_ACCESS"], var.config.logging.log_class)
    error_message = "config.logging.log_class must be STANDARD or INFREQUENT_ACCESS."
  }

  validation {
    condition     = contains(["silly", "trace", "debug", "info", "warn", "error", "fatal"], lower(var.config.log_level))
    error_message = "config.log_level is not a supported logging level."
  }

  validation {
    condition = (
      var.config.ecs.health_check_interval >= 5 && var.config.ecs.health_check_interval <= 300 &&
      var.config.ecs.health_check_timeout >= 2 && var.config.ecs.health_check_timeout <= 60 &&
      var.config.ecs.health_check_retries >= 1 && var.config.ecs.health_check_retries <= 10 &&
      var.config.ecs.health_check_start_period >= 0 && var.config.ecs.health_check_start_period <= 300
    )
    error_message = "ECS health-check interval, timeout, retries, and start period must be within ECS-supported ranges."
  }
}

variable "runner_provider" {
  description = "Compute-provider contract consumed by the scale-set listener."
  type = object({
    type                  = string
    environment_variables = map(string)
    iam_policy_json       = string
  })

  validation {
    condition     = trimspace(var.runner_provider.type) != ""
    error_message = "runner_provider.type must be non-empty."
  }

  validation {
    condition     = can(jsondecode(var.runner_provider.iam_policy_json))
    error_message = "runner_provider.iam_policy_json must be valid JSON."
  }
}
