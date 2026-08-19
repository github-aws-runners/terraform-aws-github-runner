variable "experimental" {
  description = <<-EOT
    Experimental provider-oriented configuration contract. This schema can change before it becomes stable.

    This input is accepted and normalized as groundwork for the provider split. It is intentionally not passed to `modules/runner-config` in this change and does not create or modify resources. Continue using the stable top-level `multi_runner_config` for deployed runners until the provider modules are connected. Existing required stable inputs remain required in this preparatory change.

    A non-empty `experimental.multi_runner_config` selects the experimental input for normalization; an empty map translates the stable inputs into the same canonical shape. Experimental values resolve with `runner configuration override > experimental global default > schema default` precedence. Stable flat inputs populate the canonical shape only when the experimental runner map is empty. Provider selection remains lane-scoped so a later implementation can support mixed provider maps.

    The typed nested blocks define the intended runner, GitHub, Lambda, webhook orchestration, SSM, observability, and compute-provider contract. Their resource effects and cross-field provider validations become active only when the runner-config, orchestration-provider, and compute-provider modules are connected in a follow-up change.
  EOT
  type = object({
    tags = optional(map(string), {})

    roles = optional(object({
      path                 = optional(string, null)
      permissions_boundary = optional(string, null)
    }), {})

    runner = optional(object({
      os                     = optional(string, null)
      architecture           = optional(string, null)
      disable_default_labels = optional(bool, false)
      extra_labels           = optional(list(string), [])
      group_name             = optional(string, "Default")
      name_prefix            = optional(string, "")
      run_as_root            = optional(bool, false)
      run_as                 = optional(string, "ec2-user")
      auto_update_disabled   = optional(bool, false)
      tags                   = optional(map(string), {})
      hooks = optional(object({
        job_started   = optional(string, "")
        job_completed = optional(string, "")
      }), {})
      iam = optional(object({
        role = optional(object({
          arn = string
        }), null)
        managed_policy_arns          = optional(map(string), {})
        additional_trust_policy_json = optional(string, null)
        path                         = optional(string, null)
        permissions_boundary         = optional(string, null)
      }), {})
    }), {})

    github = optional(object({
      app = optional(object({
        key_base64 = optional(string)
        key_base64_ssm = optional(object({
          arn  = string
          name = string
        }))
        id = optional(string)
        id_ssm = optional(object({
          arn  = string
          name = string
        }))
        webhook_secret = optional(string)
        webhook_secret_ssm = optional(object({
          arn  = string
          name = string
        }))
      }), null)
      additional_apps = optional(list(object({
        key_base64          = optional(string)
        key_base64_ssm      = optional(object({ arn = string, name = string }))
        id                  = optional(string)
        id_ssm              = optional(object({ arn = string, name = string }))
        installation_id     = optional(string)
        installation_id_ssm = optional(object({ arn = string, name = string }))
      })), [])
      enterprise_server = optional(object({
        url        = optional(string, null)
        ssl_verify = optional(bool, true)
      }), {})
      user_agent = optional(string, "github-aws-runners")
    }), {})

    lambda = optional(object({
      artifact = optional(object({
        s3 = optional(object({
          bucket = optional(string, null)
        }), {})
      }), {})
      runtime      = optional(string, "nodejs24.x")
      architecture = optional(string, "arm64")
      principals = optional(list(object({
        type        = string
        identifiers = list(string)
      })), [])
      subnet_ids         = optional(list(string), [])
      security_group_ids = optional(list(string), [])
      tags               = optional(map(string), {})
      role = optional(object({
        path                 = optional(string, null)
        permissions_boundary = optional(string, null)
      }), {})
    }), {})

    orchestration_provider = optional(object({
      webhook = optional(object({
        queue_selection_strategy = optional(string, "first")
        eventbridge = optional(object({
          enable        = optional(bool, true)
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
    }), {})

    ssm = optional(object({
      paths = optional(object({
        root    = optional(string, null)
        app     = optional(string, "app")
        webhook = optional(string, "webhook")
        tokens  = optional(string, "runners/tokens")
        config  = optional(string, "runners/config")
      }), {})
      kms_key_id = optional(string, null)
      tags       = optional(map(string), {})
      parameters = optional(object({
        tags = optional(map(string), {})
      }), {})
      housekeeper = optional(object({
        schedule_expression = optional(string, "rate(1 day)")
        state               = optional(string, "ENABLED")
        tags                = optional(map(string), {})
        lambda = optional(object({
          artifact = optional(object({
            zip = optional(string, null)
            s3 = optional(object({
              key            = string
              object_version = optional(string, null)
            }), null)
          }), {})
          memory_size = optional(number, 512)
          timeout     = optional(number, 60)
        }), {})
        config = optional(object({
          tokenPath      = optional(string, null)
          minimumDaysOld = optional(number, 1)
          dryRun         = optional(bool, false)
        }), {})
      }), {})
    }), {})

    observability = optional(object({
      logs = optional(object({
        level             = optional(string, "info")
        retention_in_days = optional(number, 180)
        kms_key_id        = optional(string, null)
        class             = optional(string, "STANDARD")
        tags              = optional(map(string), {})
      }), {})
      tracing = optional(object({
        mode                  = optional(string, null)
        capture_http_requests = optional(bool, false)
        capture_error         = optional(bool, false)
      }), {})
      metrics = optional(object({
        enable    = optional(bool, false)
        namespace = optional(string, "GitHub Runners")
        metric = optional(object({
          enable_github_app_rate_limit    = optional(bool, true)
          enable_job_retry                = optional(bool, true)
          enable_spot_termination         = optional(bool, true)
          enable_spot_termination_warning = optional(bool, true)
        }), {})
      }), {})
    }), {})

    compute_provider = optional(object({
      selections = optional(map(object({
        namespace = string
        type      = string
      })), null)
      aws = optional(object({
        ec2 = optional(object({
          vpc_id                         = optional(string, null)
          subnet_ids                     = optional(list(string), null)
          managed_security_group_enabled = optional(bool, true)
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
            })), [{
            cidr_blocks      = ["0.0.0.0/0"]
            ipv6_cidr_blocks = ["::/0"]
            prefix_list_ids  = null
            from_port        = 0
            protocol         = "-1"
            security_groups  = null
            self             = null
            to_port          = 0
            description      = null
          }])
          additional_security_group_ids = optional(list(string), [])
          cloudwatch_agent = optional(object({
            config = optional(string, null)
          }), {})
          instance_profile_path         = optional(string, null)
          key_name                      = optional(string, null)
          associate_public_ipv4_address = optional(bool, false)
          tags                          = optional(map(string), {})
          ami = optional(object({
            housekeeper = optional(object({
              enabled = optional(bool, false)
              cleanup_config = optional(object({
                maxItems       = optional(number)
                minimumDaysOld = optional(number)
                amiFilters = optional(list(object({
                  Name   = string
                  Values = list(string)
                })))
                launchTemplateNames = optional(list(string))
                ssmParameterNames   = optional(list(string))
                dryRun              = optional(bool)
              }), {})
              artifact = optional(object({
                zip = optional(string, null)
                s3 = optional(object({
                  key            = string
                  object_version = optional(string, null)
                }), null)
              }), {})
              lambda = optional(object({
                memory_size = optional(number, 256)
                timeout     = optional(number, 300)
              }), {})
              schedule = optional(object({
                expression = optional(string, "cron(11 7 * * ? *)")
              }), {})
            }), {})
          }), {})
          instance_termination_watcher = optional(object({
            enabled = optional(bool, false)
            features = optional(object({
              enable_spot_termination_handler              = optional(bool, true)
              enable_spot_termination_notification_watcher = optional(bool, true)
            }), {})
            enable_runner_deregistration = optional(bool, true)
            environment_variables        = optional(map(string), {})
            artifact = optional(object({
              zip = optional(string, null)
              s3 = optional(object({
                key            = string
                object_version = optional(string, null)
              }), null)
            }), {})
            lambda = optional(object({
              memory_size = optional(number, null)
              timeout     = optional(number, null)
            }), {})
          }), {})
          runner_binaries = optional(object({
            enabled = optional(bool, true)
            targets = optional(map(object({
              os           = string
              architecture = string
            })), null)
            s3 = optional(object({
              encryption = optional(object({
                enabled            = optional(bool, true)
                bucket_key_enabled = optional(bool, null)
                sse_algorithm      = optional(string, "AES256")
                kms_master_key_id  = optional(string, null)
              }), {})
              tags       = optional(map(string), {})
              versioning = optional(string, "Disabled")
              logging = optional(object({
                bucket = optional(string, null)
                prefix = optional(string, null)
              }), {})
            }), {})
            syncer = optional(object({
              artifact = optional(object({
                zip = optional(string, null)
                s3 = optional(object({
                  key            = string
                  object_version = optional(string, null)
                }), null)
              }), {})
              lambda = optional(object({
                memory_size = optional(number, 256)
                timeout     = optional(number, 300)
              }), {})
              schedule = optional(object({
                expression = optional(string, "cron(27 * * * ? *)")
                state      = optional(string, "ENABLED")
              }), {})
            }), {})
          }), {})
        }), {})
      }), {})
    }), {})

    multi_runner_config = optional(map(object({
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
            enableDynamicLabels     = optional(bool, false)
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
          enable    = optional(bool, null)
          namespace = optional(string, null)
          metric = optional(object({
            enable_github_app_rate_limit = optional(bool, null)
            enable_job_retry             = optional(bool, null)
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
            enable_on_demand_failover_for_errors = optional(list(string), [])
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
        }), {})
      })

    })), {})
  })
  default = {}
}
