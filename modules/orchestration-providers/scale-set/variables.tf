variable "prefix" {
  description = "Stable prefix used for scale-set controller resources."
  type        = string
  default     = "github-actions"
  nullable    = false
}

variable "runner_configs" {
  description = <<-EOT
    Normalized scale-set runner configurations keyed by stable runner-config name.

    Map keys must be known during planning. Credential values are never accepted: `github.app` contains only the exact GitHub App Parameter Store references used by the runtime. `github.ssl_verify` applies TLS verification per reconciler without changing process-global TLS behavior. Parameter and optional KMS ARNs, scale-set IDs, and other inner values may remain unknown until apply.
  EOT
  type = map(object({
    github = object({
      config_url = string
      app = object({
        app_id = object({
          name        = string
          arn         = string
          kms_key_arn = optional(string, null)
        })
        private_key = object({
          name        = string
          arn         = string
          kms_key_arn = optional(string, null)
        })
        installation_id = object({
          name        = string
          arn         = string
          kms_key_arn = optional(string, null)
        })
      })
      force_ghes = optional(bool, null)
      ssl_verify = optional(bool, true)
      user_agent = optional(string, null)
    })
    scale_set = object({
      name                 = string
      id                   = number
      runner_group_id      = optional(number, null)
      min_runners          = optional(number, 0)
      max_runners          = optional(number, 10)
      boot_time_in_minutes = optional(number, 10)
      session_owner        = optional(string, null)
    })
    work_folder = optional(string, null)
  }))
  nullable = false
}

variable "compute_provider_contracts" {
  description = <<-EOT
    Provider-neutral, scale-set capability fragments keyed exactly like `runner_configs`.

    `type` is the plan-known provider discriminator used by the default grouping implementation and the runtime adapter registry. `configuration_json` is provider-owned, valid JSON and must contain no secrets. `environment_variables` contains non-secret provider process settings shared by every reconciler in the same controller group; conflicting values are rejected. IAM statement map keys and optional condition shapes must be known during planning; their action, resource, and condition values may be computed.
  EOT
  type = map(object({
    type = string
    capabilities = object({
      scale_set = object({
        configuration_json    = optional(string, "{}")
        environment_variables = optional(map(string), {})
        iam_statements = optional(map(object({
          actions   = set(string)
          resources = set(string)
          conditions = optional(list(object({
            test     = string
            variable = string
            values   = set(string)
          })), [])
        })), {})
      })
    })
  }))
  nullable = false
}

variable "grouping" {
  description = <<-EOT
    Packing strategy for scale-set reconcilers. `compute_provider` creates one controller group per compute-provider type and is the default. `runner_config` creates one group per runner config. `custom` uses `custom.groups`; custom membership must cover every runner config exactly once.

    The strategy, custom group keys, and memberships select Terraform `for_each` instances and must be known during planning.
  EOT
  type = object({
    strategy = optional(string, "compute_provider")
    custom = optional(object({
      groups = map(object({
        runner_configs = set(string)
      }))
    }), null)
  })
  default  = {}
  nullable = false
}

variable "container" {
  description = "Scale-set controller image and runtime settings. A null image uses the internal official convenience image; production callers should use the release digest. Filesystem and Linux capability hardening are enforced by the module; health_path is fixed at /healthz, the ECS liveness endpoint."
  type = object({
    image                             = optional(string, null)
    user                              = optional(string, "10001:10001")
    health_port                       = optional(number, 8080)
    health_path                       = optional(string, "/healthz")
    health_check_command              = optional(list(string), null)
    health_check_interval             = optional(number, 30)
    health_check_timeout              = optional(number, 5)
    health_check_retries              = optional(number, 3)
    health_check_start_period         = optional(number, 30)
    health_stale_after_seconds        = optional(number, 180)
    shutdown_timeout_seconds          = optional(number, 110)
    session_close_timeout_seconds     = optional(number, 10)
    reconnect_initial_backoff_seconds = optional(number, 1)
    reconnect_max_backoff_seconds     = optional(number, 30)
    stop_timeout_seconds              = optional(number, 120)
    ecr_repository = optional(object({
      arn = string
    }), null)
  })
  default  = {}
  nullable = false
}

variable "config_store" {
  description = <<-EOT
    Non-secret controller configuration storage. The module writes one SSM String parameter per reconciler below `path_prefix/<controller-group>/<runner-config>`. The task receives only its group path and a SHA-256 revision, then loads the group with `GetParametersByPath`.

    Standard parameters are limited to 4096 encoded bytes and Advanced parameters to 8192 encoded bytes. Null `path_prefix` resolves to `/<prefix>/scale-set-controller`.
  EOT
  type = object({
    path_prefix = optional(string, null)
    tier        = optional(string, "Standard")
    tags        = optional(map(string), {})
  })
  default  = {}
  nullable = false
}

variable "ecs" {
  description = <<-EOT
    ECS substrate configuration. A managed cluster is created by default. For an external cluster, set `cluster.mode = "external"` and pass its ARN; the mode must be plan-known while the ARN may be computed.
  EOT
  type = object({
    cluster = optional(object({
      mode               = optional(string, "managed")
      arn                = optional(string, null)
      name               = optional(string, null)
      container_insights = optional(bool, true)
    }), {})
    task = optional(object({
      cpu              = optional(number, 512)
      memory           = optional(number, 1024)
      cpu_architecture = optional(string, "X86_64")
      ephemeral_storage = optional(object({
        size_in_gib = number
      }), null)
    }), {})
    service = optional(object({
      platform_version = optional(string, "LATEST")
    }), {})
    iam = optional(object({
      path                 = optional(string, "/")
      permissions_boundary = optional(string, null)
    }), {})
  })
  default  = {}
  nullable = false
}

variable "network" {
  description = <<-EOT
    Private Fargate networking. Tasks never receive public IP addresses and the managed security groups have no ingress. HTTPS egress defaults to IPv4 Internet access because GitHub endpoints cannot be represented as security-group destinations; route it through controlled NAT, firewall, or proxy infrastructure when required.
  EOT
  type = object({
    vpc_id     = string
    subnet_ids = set(string)
    https_egress = optional(object({
      ipv4_cidrs = optional(set(string), ["0.0.0.0/0"])
      ipv6_cidrs = optional(set(string), [])
    }), {})
  })
  nullable = false
}

variable "logging" {
  description = "CloudWatch Logs configuration. CloudWatch encrypts logs at rest with an AWS-owned key by default; set `kms_key_arn` to use a customer-managed key."
  type = object({
    retention_in_days = optional(number, 30)
    kms_key_arn       = optional(string, null)
    log_group_class   = optional(string, "STANDARD")
    tags              = optional(map(string), {})
  })
  default  = {}
  nullable = false
}

variable "tags" {
  description = "Tags applied to scale-set orchestration resources."
  type        = map(string)
  default     = {}
  nullable    = false
}
