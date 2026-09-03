# Experimental per-runner and per-lane overrides.
variable "experimental_multi_runner_config" {
  description = "Experimental per-runner and per-lane overrides."
  type = map(object({
    tags = optional(map(string), {})

    runner = optional(object({
      os                     = optional(string, null)
      architecture           = optional(string, null)
      disable_default_labels = optional(bool, null)
      extra_labels           = optional(list(string), null)
      group_name             = optional(string, null)
      name_prefix            = optional(string, null)
      run_as_root            = optional(bool, null)
      run_as                 = optional(string, null)
      auto_update_disabled   = optional(bool, null)
      tags                   = optional(map(string), {})
      hooks = optional(object({
        job_started   = optional(string, null)
        job_completed = optional(string, null)
      }), {})
      iam = optional(object({
        role = optional(object({
          arn = string
        }), null)
        managed_policy_arns          = optional(map(string), null)
        additional_trust_policy_json = optional(string, null)
        path                         = optional(string, null)
        permissions_boundary         = optional(string, null)
      }), {})
    }), {})

    lambda = optional(object({
      runtime            = optional(string, null)
      architecture       = optional(string, null)
      subnet_ids         = optional(list(string), null)
      security_group_ids = optional(list(string), null)
      tags               = optional(map(string), {})
      role = optional(object({
        path                 = optional(string, null)
        permissions_boundary = optional(string, null)
      }), {})
    }), {})

    orchestration_provider = object({
      webhook = optional(object({
        runner = optional(object({
          boot_time_in_minutes = optional(number, null)
          ephemeral            = optional(bool, null)
          jit_config_enabled   = optional(bool, null)
          maximum_count        = optional(number, null)
        }), {})

        github = optional(object({
          organization_runners = optional(bool, false)
        }), {})

        matcherConfig = object({
          labelMatchers           = list(list(string))
          exactMatch              = optional(bool, false)
          bidirectionalLabelMatch = optional(bool, false)
          priority                = optional(number, 999)
          dynamic_labels_enabled  = optional(bool, false)
          awsDynamicLabelsPolicy = optional(object({
            blocked_keys = optional(list(string), [])
            restricted_keys = optional(map(object({
              allowed = optional(list(string), [])
              denied  = optional(list(string), [])
              max     = optional(string, null)
            })), {})
          }), null)
        })

        queue = optional(object({
          delay_webhook_event            = optional(number, null)
          job_queue_retention_in_seconds = optional(number, null)
          visibility_timeout_seconds     = optional(number, null)
          redrive_build_queue = optional(object({
            enabled         = optional(bool, null)
            maxReceiveCount = optional(number, null)
          }), null)
          tags = optional(map(string), {})
        }), {})

        lambda = optional(object({
          scale = optional(object({
            up = optional(object({
              memory_size                    = optional(number, null)
              timeout                        = optional(number, null)
              reserved_concurrent_executions = optional(number, null)
              job_queued_check_enabled       = optional(bool, null)
              event_source_mapping = optional(object({
                batch_size                         = optional(number, null)
                maximum_batching_window_in_seconds = optional(number, null)
              }), {})
              tags = optional(map(string), {})
            }), {})
            down = optional(object({
              memory_size                     = optional(number, null)
              timeout                         = optional(number, null)
              schedule_expression             = optional(string, null)
              minimum_running_time_in_minutes = optional(number, null)
              idle_config = optional(list(object({
                cron             = string
                timeZone         = string
                idleCount        = number
                evictionStrategy = optional(string, "oldest_first")
              })), null)
              tags = optional(map(string), {})
            }), {})
          }), {})
          pool = optional(object({
            memory_size                    = optional(number, null)
            timeout                        = optional(number, null)
            reserved_concurrent_executions = optional(number, null)
            config = optional(list(object({
              schedule_expression          = string
              schedule_expression_timezone = optional(string)
              size                         = number
            })), null)
            include_busy_runners = optional(bool, null)
            runner_owner         = optional(string, null)
            tags                 = optional(map(string), {})
          }), {})
        }), {})

        job_retry = optional(object({
          enabled          = optional(bool, false)
          delay_in_seconds = optional(number, 300)
          delay_backoff    = optional(number, 2)
          max_attempts     = optional(number, 1)
          tags             = optional(map(string), {})
          lambda = optional(object({
            memory_size                    = optional(number, 256)
            reserved_concurrent_executions = optional(number, 1)
            timeout                        = optional(number, 30)
          }), {})
        }), {})

      }), null)

    })

    ssm = optional(object({
      paths = optional(object({
        root   = optional(string, null)
        tokens = optional(string, null)
        config = optional(string, null)
      }), {})
      tags = optional(map(string), {})
      parameters = optional(object({
        tags = optional(map(string), {})
      }), {})
      housekeeper = optional(object({
        schedule_expression = optional(string, null)
        state               = optional(string, null)
        tags                = optional(map(string), {})
        lambda = optional(object({
          artifact = optional(object({
            zip = optional(string, null)
            s3 = optional(object({
              key            = string
              object_version = optional(string, null)
            }), null)
          }), {})
          memory_size = optional(number, null)
          timeout     = optional(number, null)
        }), {})
        config = optional(object({
          tokenPath      = optional(string, null)
          minimumDaysOld = optional(number, null)
          dryRun         = optional(bool, null)
        }), {})
      }), {})
    }), {})

    observability = optional(object({
      logs = optional(object({
        level             = optional(string, null)
        retention_in_days = optional(number, null)
        kms_key_id        = optional(string, null)
        class             = optional(string, null)
        tags              = optional(map(string), {})
      }), {})
      tracing = optional(object({
        mode                  = optional(string, null)
        capture_http_requests = optional(bool, null)
        capture_error         = optional(bool, null)
      }), {})
      metrics = optional(object({
        enabled   = optional(bool, null)
        namespace = optional(string, null)
        metric = optional(object({
          github_app_rate_limit = optional(object({
            enabled = optional(bool, null)
          }), {})
          job_retry = optional(object({
            enabled = optional(bool, null)
          }), {})
          spot_termination_warning = optional(object({
            enabled = optional(bool, null)
          }), {})
        }), {})
      }), {})
    }), {})

    compute_provider = object({
      aws = optional(object({
        ec2 = optional(object({
          metadata_options = optional(object({
            instance_metadata_tags      = optional(string, "enabled")
            http_endpoint               = optional(string, "enabled")
            http_tokens                 = optional(string, "required")
            http_put_response_hop_limit = optional(number, 1)
          }), {})
          ami = optional(object({
            filter = optional(map(list(string)), { state = ["available"] })
            owners = optional(list(string), ["amazon"])
            id_ssm_parameter = optional(object({
              arn = string
            }), null)
            kms_key = optional(object({
              arn = string
            }), null)
          }), null)
          block_device_mappings = optional(list(object({
            delete_on_termination      = optional(bool, true)
            device_name                = optional(string, "/dev/xvda")
            encrypted                  = optional(bool, true)
            iops                       = optional(number)
            kms_key_id                 = optional(string)
            snapshot_id                = optional(string)
            throughput                 = optional(number)
            volume_initialization_rate = optional(number)
            volume_size                = number
            volume_type                = optional(string, "gp3")
            })), [{
            volume_size = 30
          }])
          create_service_linked_role_spot = optional(bool, false)
          credit_specification            = optional(string, null)
          ebs_optimized                   = optional(bool, false)
          cloudwatch_agent = optional(object({
            enabled = optional(bool, true)
            config  = optional(string, null)
          }), {})
          binaries_syncer = optional(object({
            enabled = optional(bool, null)
          }), {})
          detailed_monitoring_enabled = optional(bool, false)
          ssm_enabled                 = optional(bool, false)
          user_data = optional(object({
            enabled               = optional(bool, true)
            template              = optional(string, null)
            content               = optional(string, null)
            pre_install           = optional(string, "")
            post_install          = optional(string, "")
            debug_logging_enabled = optional(bool, false)
          }), {})
          instance_allocation_strategy   = optional(string, "lowest-price")
          instance_max_spot_price        = optional(string, null)
          instance_target_capacity_type  = optional(string, "spot")
          instance_type_priorities       = optional(map(number), null)
          instance_types                 = list(string)
          additional_security_group_ids  = optional(list(string), null)
          managed_security_group_enabled = optional(bool, null)
          egress_rules = optional(list(object({
            cidr_blocks      = list(string)
            ipv6_cidr_blocks = list(string)
            prefix_list_ids  = list(string)
            from_port        = number
            protocol         = string
            security_groups  = list(string)
            self             = bool
            to_port          = number
            description      = string
          })), null)
          instance_profile_path         = optional(string, null)
          key_name                      = optional(string, null)
          associate_public_ipv4_address = optional(bool, null)
          instance_profile = optional(object({
            name = string
          }), null)
          on_demand_failover_for_errors = optional(list(string), [])
          scale_errors = optional(list(string), [
            "UnfulfillableCapacity",
            "MaxSpotInstanceCountExceeded",
            "TargetCapacityLimitExceededException",
            "RequestLimitExceeded",
            "ResourceLimitExceeded",
            "MaxSpotInstanceCountExceeded",
            "MaxSpotFleetRequestCountExceeded",
            "InsufficientInstanceCapacity",
            "InsufficientCapacityOnHost",
          ])
          subnet_ids = optional(list(string), null)
          vpc_id     = optional(string, null)
          cpu_options = optional(object({
            core_count            = optional(number)
            threads_per_core      = optional(number)
            amd_sev_snp           = optional(string)
            nested_virtualization = optional(string)
          }), null)
          placement = optional(object({
            affinity                = optional(string)
            availability_zone       = optional(string)
            group_id                = optional(string)
            group_name              = optional(string)
            host_id                 = optional(string)
            host_resource_group_arn = optional(string)
            spread_domain           = optional(string)
            tenancy                 = optional(string)
            partition_number        = optional(number)
          }), null)
          license_specifications = optional(list(object({
            license_configuration_arn = string
          })), [])
          use_dedicated_host = optional(bool, false)
          log_files = optional(list(object({
            log_group_name   = string
            prefix_log_group = bool
            file_path        = string
            log_stream_name  = string
            log_class        = optional(string, "STANDARD")
          })), null)
          tags = optional(map(string), {})
        }), null)
        microvm = optional(object({
          image_arn                  = optional(string, null)
          image_version              = optional(string, null)
          ingress_network_connectors = optional(list(string), null)
          egress_network_connectors  = optional(list(string), null)
          cloudwatch_agent = optional(object({
            enabled = optional(bool, null)
            config  = optional(string, null)
          }), {})
          log_files = optional(list(object({
            log_group_name   = string
            prefix_log_group = bool
            file_path        = string
            log_stream_name  = string
            log_class        = optional(string, "STANDARD")
          })), null)
          environment_variables = optional(map(string), {})
          iam = optional(object({
            resource_arns = optional(object({
              images = optional(list(string), null)
            }), {})
            additional_policy_json = optional(object({
              scale_up = optional(string, null)
            }), {})
            managed_policies = optional(object({
              scale_up = optional(object({
                arn = string
              }), null)
              pool = optional(object({
                arn = string
              }), null)
            }), {})
          }), {})
        }), null)
      }), {})
    })

  }))
  default = {}
}
