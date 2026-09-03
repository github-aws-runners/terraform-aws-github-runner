# Translate stable v1 inputs into the experimental v2 structure.
locals {
  stable_to_experimental_tags = var.tags

  stable_to_experimental_roles = {
    path                 = var.role_path
    permissions_boundary = var.role_permissions_boundary
  }

  stable_to_experimental_runner = {
    os                     = null
    architecture           = null
    disable_default_labels = false
    extra_labels           = []
    group_name             = "Default"
    name_prefix            = ""
    run_as_root            = false
    run_as                 = "ec2-user"
    auto_update_disabled   = false
    tags                   = {}
    hooks = {
      job_started   = ""
      job_completed = ""
    }
    iam = {
      role                         = null
      managed_policy_arns          = {}
      additional_trust_policy_json = null
      path                         = null
      permissions_boundary         = null
    }
  }

  stable_to_experimental_github = {
    app             = var.github_app
    additional_apps = var.additional_github_apps
    enterprise_server = {
      url        = var.ghes_url
      ssl_verify = var.ghes_ssl_verify
    }
    user_agent = var.user_agent
  }

  stable_to_experimental_lambda = {
    artifact = {
      s3 = {
        bucket = var.lambda_s3_bucket
      }
    }
    runtime            = var.lambda_runtime
    architecture       = var.lambda_architecture
    principals         = var.lambda_principals
    subnet_ids         = var.lambda_subnet_ids
    security_group_ids = var.lambda_security_group_ids
    tags               = var.lambda_tags
    role = {
      path                 = null
      permissions_boundary = null
    }
  }

  stable_to_experimental_orchestration_provider = {
    webhook = {
      queue_selection_strategy = var.queue_selection_strategy
      eventbridge = {
        enabled       = var.eventbridge.enable
        accept_events = var.eventbridge.accept_events
      }
      matcher_config_parameter_store_tier = var.matcher_config_parameter_store_tier
      runner = {
        boot_time_in_minutes = 5
        ephemeral            = false
        jit_config_enabled   = null
        maximum_count        = null
      }
      github = {
        repository_white_list = var.repository_white_list
      }
      lambda = {
        artifact = {
          zip = var.lambda_s3_bucket == null ? var.runners_lambda_zip : null
          s3 = var.lambda_s3_bucket == null ? null : {
            key            = var.runners_lambda_s3_key
            object_version = var.runners_lambda_s3_object_version
          }
        }
        scale = {
          up = {
            memory_size                    = var.scale_up_lambda_memory_size
            timeout                        = var.runners_scale_up_lambda_timeout
            reserved_concurrent_executions = 1
            job_queued_check_enabled       = null
            event_source_mapping = {
              batch_size                         = var.lambda_event_source_mapping_batch_size
              maximum_batching_window_in_seconds = var.lambda_event_source_mapping_maximum_batching_window_in_seconds
            }
            tags = {}
          }
          down = {
            memory_size                     = var.scale_down_lambda_memory_size
            timeout                         = var.runners_scale_down_lambda_timeout
            schedule_expression             = "cron(*/5 * * * ? *)"
            minimum_running_time_in_minutes = null
            idle_config                     = []
            tags                            = {}
          }
        }
        webhook = {
          artifact = {
            zip = var.lambda_s3_bucket == null ? var.webhook_lambda_zip : null
            s3 = var.lambda_s3_bucket == null ? null : {
              key            = var.webhook_lambda_s3_key
              object_version = var.webhook_lambda_s3_object_version
            }
          }
          api_gateway_access_log_settings = var.webhook_lambda_apigateway_access_log_settings
          memory_size                     = var.webhook_lambda_memory_size
          timeout                         = var.webhook_lambda_timeout
          tags                            = {}
        }
        pool = {
          memory_size                    = 512
          timeout                        = var.pool_lambda_timeout
          reserved_concurrent_executions = var.pool_lambda_reserved_concurrent_executions
          config                         = []
          include_busy_runners           = false
          runner_owner                   = null
          tags                           = {}
        }
      }
      queue = {
        delay_webhook_event            = 30
        job_queue_retention_in_seconds = 86400
        visibility_timeout_seconds     = var.runners_scale_up_lambda_timeout
        redrive_build_queue = {
          enabled         = false
          maxReceiveCount = null
        }
        tags       = {}
        encryption = var.queue_encryption
      }
    }
  }

  stable_to_experimental_ssm = {
    paths = {
      root    = "/${var.ssm_paths.root}/${var.prefix}"
      app     = var.ssm_paths.app
      webhook = var.ssm_paths.webhook
      tokens  = "${var.ssm_paths.runners}/tokens"
      config  = "${var.ssm_paths.runners}/config"
    }
    kms_key_id = var.kms_key_arn
    tags       = {}
    parameters = {
      tags = var.parameter_store_tags
    }
    housekeeper = {
      schedule_expression = var.runners_ssm_housekeeper.schedule_expression
      state               = var.runners_ssm_housekeeper.enabled ? "ENABLED" : "DISABLED"
      tags                = {}
      lambda = {
        artifact = {
          zip = var.lambda_s3_bucket == null ? var.runners_lambda_zip : null
          s3 = var.lambda_s3_bucket == null ? null : {
            key            = var.runners_lambda_s3_key
            object_version = var.runners_lambda_s3_object_version
          }
        }
        memory_size = var.runners_ssm_housekeeper.lambda_memory_size
        timeout     = var.runners_ssm_housekeeper.lambda_timeout
      }
      config = {
        tokenPath      = var.runners_ssm_housekeeper.config.tokenPath
        minimumDaysOld = var.runners_ssm_housekeeper.config.minimumDaysOld
        dryRun         = var.runners_ssm_housekeeper.config.dryRun
      }
    }
  }

  stable_to_experimental_observability = {
    logs = {
      level             = var.log_level
      retention_in_days = var.logging_retention_in_days
      kms_key_id        = var.logging_kms_key_id
      class             = var.log_class
      tags              = {}
    }
    tracing = var.tracing_config
    metrics = {
      enabled   = var.metrics.enable
      namespace = var.metrics.namespace
      metric = {
        github_app_rate_limit = {
          enabled = var.metrics.metric.enable_github_app_rate_limit
        }
        job_retry = {
          enabled = var.metrics.metric.enable_job_retry
        }
        spot_termination_warning = {
          enabled = var.metrics.metric.enable_spot_termination_warning
        }
      }
    }
  }

  stable_to_experimental_compute_provider = {
    selections = null
    aws = {
      ec2 = {
        vpc_id                         = var.vpc_id
        subnet_ids                     = var.subnet_ids
        managed_security_group_enabled = var.enable_managed_runner_security_group
        egress_rules                   = var.runner_egress_rules
        additional_security_group_ids  = var.runner_additional_security_group_ids
        cloudwatch_agent = {
          config = var.cloudwatch_config
        }
        instance_profile_path         = var.instance_profile_path
        key_name                      = var.key_name
        associate_public_ipv4_address = var.associate_public_ipv4_address
        tags                          = {}
        ami = {
          housekeeper = {
            enabled        = var.enable_ami_housekeeper
            cleanup_config = var.ami_housekeeper_cleanup_config
            artifact = {
              zip = var.lambda_s3_bucket == null ? var.ami_housekeeper_lambda_zip : null
              s3 = var.lambda_s3_bucket == null ? null : {
                key            = var.ami_housekeeper_lambda_s3_key
                object_version = var.ami_housekeeper_lambda_s3_object_version
              }
            }
            lambda = {
              memory_size = var.ami_housekeeper_lambda_memory_size
              timeout     = var.ami_housekeeper_lambda_timeout
            }
            schedule = {
              expression = var.ami_housekeeper_lambda_schedule_expression
            }
          }
        }
        instance_termination_watcher = {
          enabled = var.instance_termination_watcher.enable
          features = {
            runner_deregistration = {
              enabled = var.instance_termination_watcher.enable_runner_deregistration
            }
            spot_termination_handler = {
              enabled = var.instance_termination_watcher.features.enable_spot_termination_handler
            }
            spot_termination_notification_watcher = {
              enabled = var.instance_termination_watcher.features.enable_spot_termination_notification_watcher
            }
          }
          environment_variables = var.instance_termination_watcher.environment_variables
          artifact = {
            zip = var.lambda_s3_bucket == null ? var.instance_termination_watcher.zip : null
            s3 = var.lambda_s3_bucket == null ? null : {
              key            = var.instance_termination_watcher.s3_key
              object_version = var.instance_termination_watcher.s3_object_version
            }
          }
          lambda = {
            memory_size = var.instance_termination_watcher.memory_size
            timeout     = var.instance_termination_watcher.timeout
          }
        }
        runner_binaries = {
          enabled = true
          s3 = {
            encryption = {
              enabled            = var.runner_binaries_s3_sse_configuration != null
              bucket_key_enabled = try(var.runner_binaries_s3_sse_configuration.rule.bucket_key_enabled, null)
              sse_algorithm      = try(var.runner_binaries_s3_sse_configuration.rule.apply_server_side_encryption_by_default.sse_algorithm, "AES256")
              kms_master_key_id  = try(var.runner_binaries_s3_sse_configuration.rule.apply_server_side_encryption_by_default.kms_master_key_id, null)
            }
            tags       = var.runner_binaries_s3_tags
            versioning = var.runner_binaries_s3_versioning
            logging = {
              bucket = null
              prefix = null
            }
          }
          syncer = {
            artifact = {
              zip = var.lambda_s3_bucket == null ? var.runner_binaries_syncer_lambda_zip : null
              s3 = var.lambda_s3_bucket == null ? null : {
                key            = var.syncer_lambda_s3_key
                object_version = var.syncer_lambda_s3_object_version
              }
            }
            lambda = {
              memory_size = var.runner_binaries_syncer_memory_size
              timeout     = var.runner_binaries_syncer_lambda_timeout
            }
            schedule = {
              expression = "cron(27 * * * ? *)"
              state      = var.state_event_rule_binaries_syncer
            }
          }
        }
      }
    }
  }

  stable_to_experimental_multi_runner_config = {
    for k, v in var.multi_runner_config : k => {
      tags = {}

      runner = {
        os                     = v.runner_config.runner_os
        architecture           = v.runner_config.runner_architecture
        disable_default_labels = v.runner_config.runner_disable_default_labels
        extra_labels           = v.runner_config.runner_extra_labels
        group_name             = v.runner_config.runner_group_name
        name_prefix            = v.runner_config.runner_name_prefix
        run_as_root            = v.runner_config.runner_as_root
        run_as                 = v.runner_config.runner_run_as
        auto_update_disabled   = v.runner_config.disable_runner_autoupdate
        tags                   = {}
        hooks = {
          job_started   = v.runner_config.runner_hook_job_started
          job_completed = v.runner_config.runner_hook_job_completed
        }
        iam = {
          role = v.runner_config.iam_overrides.override_runner_role == true ? {
            arn = v.runner_config.iam_overrides.runner_role_arn
          } : null
          managed_policy_arns = {
            for policy_index, policy_arn in v.runner_config.runner_iam_role_managed_policy_arns :
            "legacy-${policy_index}" => policy_arn
          }
          additional_trust_policy_json = null
          path                         = null
          permissions_boundary         = null
        }
      }

      lambda = {
        runtime            = null
        architecture       = null
        subnet_ids         = null
        security_group_ids = null
        tags               = {}
        role = {
          path                 = null
          permissions_boundary = null
        }
      }

      orchestration_provider = {
        webhook = {
          runner = {
            boot_time_in_minutes = v.runner_config.runner_boot_time_in_minutes
            ephemeral            = v.runner_config.enable_ephemeral_runners
            jit_config_enabled   = v.runner_config.enable_jit_config
            maximum_count        = v.runner_config.runners_maximum_count
          }

          github = {
            organization_runners = v.runner_config.enable_organization_runners
          }

          matcherConfig = {
            labelMatchers           = v.matcherConfig.labelMatchers
            exactMatch              = v.matcherConfig.exactMatch
            bidirectionalLabelMatch = v.matcherConfig.bidirectionalLabelMatch
            priority                = v.matcherConfig.priority
            dynamic_labels_enabled  = v.matcherConfig.enableDynamicLabels
            awsDynamicLabelsPolicy  = v.matcherConfig.awsDynamicLabelsPolicy
          }

          lambda = {
            scale = {
              up = {
                memory_size                    = null
                timeout                        = null
                reserved_concurrent_executions = v.runner_config.scale_up_reserved_concurrent_executions
                job_queued_check_enabled       = v.runner_config.enable_job_queued_check
                event_source_mapping = {
                  batch_size                         = v.runner_config.lambda_event_source_mapping_batch_size
                  maximum_batching_window_in_seconds = v.runner_config.lambda_event_source_mapping_maximum_batching_window_in_seconds
                }
                tags = {}
              }
              down = {
                memory_size                     = null
                timeout                         = null
                schedule_expression             = v.runner_config.scale_down_schedule_expression
                minimum_running_time_in_minutes = v.runner_config.minimum_running_time_in_minutes
                idle_config                     = v.runner_config.idle_config
                tags                            = {}
              }
            }
            pool = {
              memory_size                    = null
              timeout                        = null
              reserved_concurrent_executions = null
              config                         = v.runner_config.pool_config
              include_busy_runners           = false
              runner_owner                   = v.runner_config.pool_runner_owner
              tags                           = {}
            }
          }

          queue = {
            delay_webhook_event            = v.runner_config.delay_webhook_event
            job_queue_retention_in_seconds = v.runner_config.job_queue_retention_in_seconds
            visibility_timeout_seconds     = var.runners_scale_up_lambda_timeout
            redrive_build_queue            = v.redrive_build_queue
            tags                           = {}
          }

          job_retry = {
            enabled          = v.runner_config.job_retry.enable
            delay_in_seconds = v.runner_config.job_retry.delay_in_seconds
            delay_backoff    = v.runner_config.job_retry.delay_backoff
            max_attempts     = v.runner_config.job_retry.max_attempts
            tags             = {}
            lambda = {
              memory_size                    = v.runner_config.job_retry.lambda_memory_size
              reserved_concurrent_executions = 1
              timeout                        = v.runner_config.job_retry.lambda_timeout
            }
          }
        }
      }

      ssm = {
        paths = {
          root   = null
          tokens = null
          config = null
        }
        tags = {}
        parameters = {
          tags = {}
        }
        housekeeper = {
          schedule_expression = null
          state               = null
          tags                = {}
          lambda = {
            artifact = {
              zip = null
              s3  = null
            }
            memory_size = null
            timeout     = null
          }
          config = {
            tokenPath      = null
            minimumDaysOld = null
            dryRun         = null
          }
        }
      }

      observability = {
        logs = {
          level             = null
          retention_in_days = null
          kms_key_id        = null
          class             = null
          tags              = {}
        }
        tracing = {
          mode                  = null
          capture_http_requests = null
          capture_error         = null
        }
        metrics = {
          enabled   = null
          namespace = null
          metric = {
            github_app_rate_limit = {
              enabled = null
            }
            job_retry = {
              enabled = null
            }
            spot_termination_warning = {
              enabled = null
            }
          }
        }
      }

      compute_provider = {
        aws = {
          ec2 = {
            metadata_options = {
              instance_metadata_tags      = tostring(v.runner_config.runner_metadata_options["instance_metadata_tags"])
              http_endpoint               = tostring(v.runner_config.runner_metadata_options["http_endpoint"])
              http_tokens                 = tostring(v.runner_config.runner_metadata_options["http_tokens"])
              http_put_response_hop_limit = tonumber(v.runner_config.runner_metadata_options["http_put_response_hop_limit"])
            }
            ami = v.runner_config.ami == null ? null : {
              filter = v.runner_config.ami.filter
              owners = v.runner_config.ami.owners
              id_ssm_parameter = v.runner_config.ami.id_ssm_parameter_arn == null ? null : {
                arn = v.runner_config.ami.id_ssm_parameter_arn
              }
              kms_key = v.runner_config.ami.kms_key_arn == null ? null : {
                arn = v.runner_config.ami.kms_key_arn
              }
            }
            block_device_mappings           = v.runner_config.block_device_mappings
            create_service_linked_role_spot = v.runner_config.create_service_linked_role_spot
            credit_specification            = v.runner_config.credit_specification
            ebs_optimized                   = v.runner_config.ebs_optimized
            cloudwatch_agent = {
              enabled = v.runner_config.enable_cloudwatch_agent
              config  = v.runner_config.cloudwatch_config
            }
            binaries_syncer = {
              enabled = v.runner_config.enable_runner_binaries_syncer
            }
            detailed_monitoring_enabled = v.runner_config.enable_runner_detailed_monitoring
            ssm_enabled                 = v.runner_config.enable_ssm_on_runners
            user_data = {
              enabled               = v.runner_config.enable_userdata
              template              = v.runner_config.userdata_template
              content               = v.runner_config.userdata_content
              pre_install           = v.runner_config.userdata_pre_install
              post_install          = v.runner_config.userdata_post_install
              debug_logging_enabled = false
            }
            instance_allocation_strategy   = v.runner_config.instance_allocation_strategy
            instance_max_spot_price        = v.runner_config.instance_max_spot_price
            instance_target_capacity_type  = v.runner_config.instance_target_capacity_type
            instance_type_priorities       = v.runner_config.instance_type_priorities
            instance_types                 = v.runner_config.instance_types
            additional_security_group_ids  = length(v.runner_config.runner_additional_security_group_ids) == 0 ? null : v.runner_config.runner_additional_security_group_ids
            managed_security_group_enabled = null
            egress_rules                   = null
            instance_profile_path          = null
            key_name                       = null
            associate_public_ipv4_address  = null
            instance_profile = v.runner_config.iam_overrides.override_instance_profile == true ? {
              name = v.runner_config.iam_overrides.instance_profile_name
            } : null
            on_demand_failover_for_errors = v.runner_config.enable_on_demand_failover_for_errors
            scale_errors                  = v.runner_config.scale_errors
            subnet_ids                    = v.runner_config.subnet_ids
            vpc_id                        = v.runner_config.vpc_id
            cpu_options                   = v.runner_config.cpu_options
            placement                     = v.runner_config.placement
            license_specifications        = v.runner_config.license_specifications
            use_dedicated_host            = v.runner_config.use_dedicated_host
            log_files                     = v.runner_config.runner_log_files
            tags                          = v.runner_config.runner_ec2_tags
          }
        }
      }
    }
  }

}
