# Experimental global orchestration-provider configuration.
variable "experimental_global_config_orchestration_provider" {
  description = "Experimental global orchestration-provider configuration."
  type = object({
    webhook = optional(object({
      queue_selection_strategy = optional(string, "first")
      eventbridge = optional(object({
        enabled       = optional(bool, true)
        accept_events = optional(list(string), [])
      }), {})
      matcher_config_parameter_store_tier = optional(string, "Standard")
      runner = optional(object({
        boot_time_in_minutes = optional(number, 5)
        ephemeral            = optional(bool, false)
        jit_config_enabled   = optional(bool, null)
        maximum_count        = optional(number, null)
      }), {})

      github = optional(object({
        repository_white_list = optional(list(string), [])
      }), {})

      lambda = optional(object({
        artifact = optional(object({
          zip = optional(string, null)
          s3 = optional(object({
            key            = string
            object_version = optional(string, null)
          }), null)
        }), {})
        scale = optional(object({
          up = optional(object({
            memory_size                    = optional(number, 512)
            timeout                        = optional(number, 30)
            reserved_concurrent_executions = optional(number, 1)
            job_queued_check_enabled       = optional(bool, null)
            event_source_mapping = optional(object({
              batch_size                         = optional(number, 10)
              maximum_batching_window_in_seconds = optional(number, 0)
            }), {})
            tags = optional(map(string), {})
          }), {})
          down = optional(object({
            memory_size                     = optional(number, 512)
            timeout                         = optional(number, 60)
            schedule_expression             = optional(string, "cron(*/5 * * * ? *)")
            minimum_running_time_in_minutes = optional(number, null)
            idle_config = optional(list(object({
              cron             = string
              timeZone         = string
              idleCount        = number
              evictionStrategy = optional(string, "oldest_first")
            })), [])
            tags = optional(map(string), {})
          }), {})
        }), {})
        webhook = optional(object({
          artifact = optional(object({
            zip = optional(string, null)
            s3 = optional(object({
              key            = string
              object_version = optional(string, null)
            }), null)
          }), {})
          api_gateway_access_log_settings = optional(object({
            destination_arn = string
            format          = string
          }), null)
          memory_size = optional(number, 256)
          timeout     = optional(number, 10)
          tags        = optional(map(string), {})
        }), {})
        pool = optional(object({
          memory_size                    = optional(number, 512)
          timeout                        = optional(number, 60)
          reserved_concurrent_executions = optional(number, 1)
          config = optional(list(object({
            schedule_expression          = string
            schedule_expression_timezone = optional(string)
            size                         = number
          })), [])
          include_busy_runners = optional(bool, false)
          runner_owner         = optional(string, null)
          tags                 = optional(map(string), {})
        }), {})
      }), {})

      queue = optional(object({
        delay_webhook_event            = optional(number, 30)
        job_queue_retention_in_seconds = optional(number, 86400)
        visibility_timeout_seconds     = optional(number, 180)
        redrive_build_queue = optional(object({
          enabled         = optional(bool, false)
          maxReceiveCount = optional(number, null)
          }), {
          enabled         = false
          maxReceiveCount = null
        })
        tags = optional(map(string), {})
        encryption = optional(object({
          kms_data_key_reuse_period_seconds = number
          kms_master_key_id                 = string
          sqs_managed_sse_enabled           = bool
          }), {
          kms_data_key_reuse_period_seconds = null
          kms_master_key_id                 = null
          sqs_managed_sse_enabled           = true
        })
      }), {})

    }), {})

    scale_set = optional(object({
      grouping = optional(object({
        strategy = optional(string, "compute_provider")
        custom = optional(object({
          groups = map(object({
            runner_configs = set(string)
          }))
        }), null)
      }), {})
      container = optional(object({
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
      }), {})
      config_store = optional(object({
        path_prefix = optional(string, null)
        tier        = optional(string, "Standard")
        tags        = optional(map(string), {})
      }), {})
      ecs = optional(object({
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
      }), {})
      network = optional(object({
        vpc_id     = optional(string, null)
        subnet_ids = optional(set(string), null)
        https_egress = optional(object({
          ipv4_cidrs = optional(set(string), ["0.0.0.0/0"])
          ipv6_cidrs = optional(set(string), [])
        }), {})
      }), {})
      logging = optional(object({
        retention_in_days = optional(number, 30)
        kms_key_arn       = optional(string, null)
        log_group_class   = optional(string, "STANDARD")
        tags              = optional(map(string), {})
      }), {})
      tags = optional(map(string), {})
    }), {})
  })
  default = {}
}
