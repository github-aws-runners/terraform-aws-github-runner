# Project stable v1 inputs into the experimental schema, then resolve every
# runner configuration against the experimental global defaults. The base object remains
# schema-compatible with var.experimental; the final canonical object adds
# effective per-configuration fields and the resource-backed binary distribution consumed
# by downstream runner modules.
locals {
  # A non-empty experimental map is the module-level v2 opt-in. Stable v1 and
  # experimental v2 resources must never be selected in the same deployment.
  use_multi_runner_config_v2 = length(var.experimental.multi_runner_config) > 0

  raw_translated_experimental = local.use_multi_runner_config_v2 ? var.experimental : {
    tags = var.tags

    roles = {
      path                 = var.role_path
      permissions_boundary = var.role_permissions_boundary
    }

    runner = {
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

    github = {
      app             = var.github_app
      additional_apps = var.additional_github_apps
      enterprise_server = {
        url        = var.ghes_url
        ssl_verify = var.ghes_ssl_verify
      }
      user_agent = var.user_agent
    }

    lambda = {
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

    orchestration_provider = {
      webhook = {
        queue_selection_strategy            = var.queue_selection_strategy
        eventbridge                         = var.eventbridge
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

    ssm = {
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

    observability = {
      logs = {
        level             = var.log_level
        retention_in_days = var.logging_retention_in_days
        kms_key_id        = var.logging_kms_key_id
        class             = var.log_class
        tags              = {}
      }
      tracing = var.tracing_config
      metrics = {
        enable    = var.metrics.enable
        namespace = var.metrics.namespace
        metric = {
          enable_github_app_rate_limit    = var.metrics.metric.enable_github_app_rate_limit
          enable_job_retry                = var.metrics.metric.enable_job_retry
          enable_spot_termination         = true
          enable_spot_termination_warning = var.metrics.metric.enable_spot_termination_warning
        }
      }
    }

    compute_provider = {
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
            enabled                      = var.instance_termination_watcher.enable
            features                     = var.instance_termination_watcher.features
            enable_runner_deregistration = var.instance_termination_watcher.enable_runner_deregistration
            environment_variables        = var.instance_termination_watcher.environment_variables
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
            targets = null
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
        microvm = {
          image_arn                   = null
          image_version               = null
          ingress_network_connectors  = []
          egress_network_connectors   = []
          maximum_duration_in_seconds = null
          environment_variables       = {}
          iam = {
            resource_arns = {
              images   = ["*"]
              microvms = ["*"]
            }
            additional_policy_json = {
              scale_up = null
            }
            managed_policies = {
              scale_up = null
              pool     = null
            }
          }
        }
      }
    }

    multi_runner_config = {
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

            matcherConfig = v.matcherConfig

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
            enable    = null
            namespace = null
            metric = {
              enable_github_app_rate_limit = null
              enable_job_retry             = null
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
              enable_on_demand_failover_for_errors = v.runner_config.enable_on_demand_failover_for_errors
              scale_errors                         = v.runner_config.scale_errors
              subnet_ids                           = v.runner_config.subnet_ids
              vpc_id                               = v.runner_config.vpc_id
              cpu_options                          = v.runner_config.cpu_options
              placement                            = v.runner_config.placement
              license_specifications               = v.runner_config.license_specifications
              use_dedicated_host                   = v.runner_config.use_dedicated_host
              log_files                            = v.runner_config.runner_log_files
              tags                                 = v.runner_config.runner_ec2_tags
            }
            microvm = null
          }
        }
      }
    }
  }
}

locals {
  translated_experimental_base = merge(local.raw_translated_experimental, {
    multi_runner_config = {
      for k, v in local.raw_translated_experimental.multi_runner_config : k => merge(v, {
        tags = merge(local.raw_translated_experimental.tags, v.tags)

        runner = merge(v.runner, {
          os                     = try(coalesce(v.runner.os, local.raw_translated_experimental.runner.os), null)
          architecture           = try(coalesce(v.runner.architecture, local.raw_translated_experimental.runner.architecture), null)
          disable_default_labels = coalesce(v.runner.disable_default_labels, local.raw_translated_experimental.runner.disable_default_labels)
          extra_labels           = v.runner.extra_labels != null ? v.runner.extra_labels : local.raw_translated_experimental.runner.extra_labels
          group_name             = coalesce(v.runner.group_name, local.raw_translated_experimental.runner.group_name)
          name_prefix            = v.runner.name_prefix != null ? v.runner.name_prefix : local.raw_translated_experimental.runner.name_prefix
          run_as_root            = coalesce(v.runner.run_as_root, local.raw_translated_experimental.runner.run_as_root)
          run_as                 = coalesce(v.runner.run_as, local.raw_translated_experimental.runner.run_as)
          auto_update_disabled   = coalesce(v.runner.auto_update_disabled, local.raw_translated_experimental.runner.auto_update_disabled)
          tags                   = merge(local.raw_translated_experimental.runner.tags, v.runner.tags)
          hooks = {
            job_started   = v.runner.hooks.job_started != null ? v.runner.hooks.job_started : local.raw_translated_experimental.runner.hooks.job_started
            job_completed = v.runner.hooks.job_completed != null ? v.runner.hooks.job_completed : local.raw_translated_experimental.runner.hooks.job_completed
          }
          iam = {
            role = try(coalesce(v.runner.iam.role, local.raw_translated_experimental.runner.iam.role), null)
            managed_policy_arns = v.runner.iam.role != null ? (
              v.runner.iam.managed_policy_arns != null ? v.runner.iam.managed_policy_arns : {}
              ) : (
              v.runner.iam.managed_policy_arns != null ? v.runner.iam.managed_policy_arns : local.raw_translated_experimental.runner.iam.managed_policy_arns
            )
            additional_trust_policy_json = v.runner.iam.role != null ? v.runner.iam.additional_trust_policy_json : try(coalesce(v.runner.iam.additional_trust_policy_json, local.raw_translated_experimental.runner.iam.additional_trust_policy_json), null)
            path                         = try(coalesce(v.runner.iam.path, local.raw_translated_experimental.runner.iam.path, local.raw_translated_experimental.roles.path), null)
            permissions_boundary         = try(coalesce(v.runner.iam.permissions_boundary, local.raw_translated_experimental.runner.iam.permissions_boundary, local.raw_translated_experimental.roles.permissions_boundary), null)
          }
        })

        lambda = merge(v.lambda, {
          runtime            = coalesce(v.lambda.runtime, local.raw_translated_experimental.lambda.runtime)
          architecture       = coalesce(v.lambda.architecture, local.raw_translated_experimental.lambda.architecture)
          subnet_ids         = v.lambda.subnet_ids != null ? v.lambda.subnet_ids : local.raw_translated_experimental.lambda.subnet_ids
          security_group_ids = v.lambda.security_group_ids != null ? v.lambda.security_group_ids : local.raw_translated_experimental.lambda.security_group_ids
          tags               = merge(local.raw_translated_experimental.lambda.tags, v.lambda.tags)
          role = {
            path = try(coalesce(
              v.lambda.role.path,
              local.raw_translated_experimental.lambda.role.path,
              local.raw_translated_experimental.roles.path,
            ), null)
            permissions_boundary = try(coalesce(
              v.lambda.role.permissions_boundary,
              local.raw_translated_experimental.lambda.role.permissions_boundary,
              local.raw_translated_experimental.roles.permissions_boundary,
            ), null)
          }
        })

        orchestration_provider = {
          webhook = v.orchestration_provider.webhook == null ? null : merge(v.orchestration_provider.webhook, {
            runner = {
              boot_time_in_minutes = coalesce(
                v.orchestration_provider.webhook.runner.boot_time_in_minutes,
                local.raw_translated_experimental.orchestration_provider.webhook.runner.boot_time_in_minutes,
              )
              ephemeral = coalesce(
                v.orchestration_provider.webhook.runner.ephemeral,
                local.raw_translated_experimental.orchestration_provider.webhook.runner.ephemeral,
              )
              jit_config_enabled = try(coalesce(
                v.orchestration_provider.webhook.runner.jit_config_enabled,
                local.raw_translated_experimental.orchestration_provider.webhook.runner.jit_config_enabled,
              ), null)
              maximum_count = try(coalesce(
                v.orchestration_provider.webhook.runner.maximum_count,
                local.raw_translated_experimental.orchestration_provider.webhook.runner.maximum_count,
              ), null)
            }

            lambda = merge(v.orchestration_provider.webhook.lambda, {
              scale = merge(v.orchestration_provider.webhook.lambda.scale, {
                up = merge(v.orchestration_provider.webhook.lambda.scale.up, {
                  memory_size                    = coalesce(v.orchestration_provider.webhook.lambda.scale.up.memory_size, local.raw_translated_experimental.orchestration_provider.webhook.lambda.scale.up.memory_size)
                  timeout                        = coalesce(v.orchestration_provider.webhook.lambda.scale.up.timeout, local.raw_translated_experimental.orchestration_provider.webhook.lambda.scale.up.timeout)
                  reserved_concurrent_executions = coalesce(v.orchestration_provider.webhook.lambda.scale.up.reserved_concurrent_executions, local.raw_translated_experimental.orchestration_provider.webhook.lambda.scale.up.reserved_concurrent_executions)
                  job_queued_check_enabled       = try(coalesce(v.orchestration_provider.webhook.lambda.scale.up.job_queued_check_enabled, local.raw_translated_experimental.orchestration_provider.webhook.lambda.scale.up.job_queued_check_enabled), null)
                  event_source_mapping = {
                    batch_size = coalesce(
                      v.orchestration_provider.webhook.lambda.scale.up.event_source_mapping.batch_size,
                      local.raw_translated_experimental.orchestration_provider.webhook.lambda.scale.up.event_source_mapping.batch_size,
                    )
                    maximum_batching_window_in_seconds = coalesce(
                      v.orchestration_provider.webhook.lambda.scale.up.event_source_mapping.maximum_batching_window_in_seconds,
                      local.raw_translated_experimental.orchestration_provider.webhook.lambda.scale.up.event_source_mapping.maximum_batching_window_in_seconds,
                    )
                  }
                  tags = merge(local.raw_translated_experimental.orchestration_provider.webhook.lambda.scale.up.tags, v.orchestration_provider.webhook.lambda.scale.up.tags)
                })
                down = merge(v.orchestration_provider.webhook.lambda.scale.down, {
                  memory_size                     = coalesce(v.orchestration_provider.webhook.lambda.scale.down.memory_size, local.raw_translated_experimental.orchestration_provider.webhook.lambda.scale.down.memory_size)
                  timeout                         = coalesce(v.orchestration_provider.webhook.lambda.scale.down.timeout, local.raw_translated_experimental.orchestration_provider.webhook.lambda.scale.down.timeout)
                  schedule_expression             = coalesce(v.orchestration_provider.webhook.lambda.scale.down.schedule_expression, local.raw_translated_experimental.orchestration_provider.webhook.lambda.scale.down.schedule_expression)
                  minimum_running_time_in_minutes = try(coalesce(v.orchestration_provider.webhook.lambda.scale.down.minimum_running_time_in_minutes, local.raw_translated_experimental.orchestration_provider.webhook.lambda.scale.down.minimum_running_time_in_minutes), null)
                  idle_config                     = v.orchestration_provider.webhook.lambda.scale.down.idle_config != null ? v.orchestration_provider.webhook.lambda.scale.down.idle_config : local.raw_translated_experimental.orchestration_provider.webhook.lambda.scale.down.idle_config
                  tags                            = merge(local.raw_translated_experimental.orchestration_provider.webhook.lambda.scale.down.tags, v.orchestration_provider.webhook.lambda.scale.down.tags)
                })
              })
              pool = merge(v.orchestration_provider.webhook.lambda.pool, {
                memory_size                    = coalesce(v.orchestration_provider.webhook.lambda.pool.memory_size, local.raw_translated_experimental.orchestration_provider.webhook.lambda.pool.memory_size)
                timeout                        = coalesce(v.orchestration_provider.webhook.lambda.pool.timeout, local.raw_translated_experimental.orchestration_provider.webhook.lambda.pool.timeout)
                reserved_concurrent_executions = coalesce(v.orchestration_provider.webhook.lambda.pool.reserved_concurrent_executions, local.raw_translated_experimental.orchestration_provider.webhook.lambda.pool.reserved_concurrent_executions)
                config                         = v.orchestration_provider.webhook.lambda.pool.config != null ? v.orchestration_provider.webhook.lambda.pool.config : local.raw_translated_experimental.orchestration_provider.webhook.lambda.pool.config
                include_busy_runners           = coalesce(v.orchestration_provider.webhook.lambda.pool.include_busy_runners, local.raw_translated_experimental.orchestration_provider.webhook.lambda.pool.include_busy_runners)
                runner_owner                   = try(coalesce(v.orchestration_provider.webhook.lambda.pool.runner_owner, local.raw_translated_experimental.orchestration_provider.webhook.lambda.pool.runner_owner), null)
                tags                           = merge(local.raw_translated_experimental.orchestration_provider.webhook.lambda.pool.tags, v.orchestration_provider.webhook.lambda.pool.tags)
              })
            })

            queue = merge(v.orchestration_provider.webhook.queue, {
              delay_webhook_event            = coalesce(v.orchestration_provider.webhook.queue.delay_webhook_event, local.raw_translated_experimental.orchestration_provider.webhook.queue.delay_webhook_event)
              job_queue_retention_in_seconds = coalesce(v.orchestration_provider.webhook.queue.job_queue_retention_in_seconds, local.raw_translated_experimental.orchestration_provider.webhook.queue.job_queue_retention_in_seconds)
              visibility_timeout_seconds     = coalesce(v.orchestration_provider.webhook.queue.visibility_timeout_seconds, local.raw_translated_experimental.orchestration_provider.webhook.queue.visibility_timeout_seconds)
              redrive_build_queue = {
                enabled = try(
                  coalesce(try(v.orchestration_provider.webhook.queue.redrive_build_queue.enabled, null), local.raw_translated_experimental.orchestration_provider.webhook.queue.redrive_build_queue.enabled),
                  local.raw_translated_experimental.orchestration_provider.webhook.queue.redrive_build_queue.enabled,
                )
                maxReceiveCount = try(
                  coalesce(try(v.orchestration_provider.webhook.queue.redrive_build_queue.maxReceiveCount, null), local.raw_translated_experimental.orchestration_provider.webhook.queue.redrive_build_queue.maxReceiveCount),
                  null,
                )
              }
              tags = merge(local.raw_translated_experimental.orchestration_provider.webhook.queue.tags, v.orchestration_provider.webhook.queue.tags)
            })
          })
        }

        ssm = merge(v.ssm, {
          paths = {
            root = "${trimsuffix(coalesce(
              v.ssm.paths.root,
              local.raw_translated_experimental.ssm.paths.root,
              "/github-action-runners/${var.prefix}",
            ), "/")}/${k}"
            tokens = coalesce(v.ssm.paths.tokens, local.raw_translated_experimental.ssm.paths.tokens)
            config = coalesce(v.ssm.paths.config, local.raw_translated_experimental.ssm.paths.config)
          }
          tags = merge(local.raw_translated_experimental.ssm.tags, v.ssm.tags)
          parameters = {
            tags = merge(local.raw_translated_experimental.ssm.parameters.tags, v.ssm.parameters.tags)
          }
          housekeeper = {
            schedule_expression = coalesce(v.ssm.housekeeper.schedule_expression, local.raw_translated_experimental.ssm.housekeeper.schedule_expression)
            state               = coalesce(v.ssm.housekeeper.state, local.raw_translated_experimental.ssm.housekeeper.state)
            tags                = merge(local.raw_translated_experimental.ssm.housekeeper.tags, v.ssm.housekeeper.tags)
            lambda = {
              artifact = {
                zip = v.ssm.housekeeper.lambda.artifact.s3 != null ? null : try(coalesce(
                  v.ssm.housekeeper.lambda.artifact.zip,
                  local.raw_translated_experimental.ssm.housekeeper.lambda.artifact.zip,
                ), null)
                s3 = v.ssm.housekeeper.lambda.artifact.s3 != null ? v.ssm.housekeeper.lambda.artifact.s3 : (
                  v.ssm.housekeeper.lambda.artifact.zip != null ? null : local.raw_translated_experimental.ssm.housekeeper.lambda.artifact.s3
                )
              }
              memory_size = coalesce(v.ssm.housekeeper.lambda.memory_size, local.raw_translated_experimental.ssm.housekeeper.lambda.memory_size)
              timeout     = coalesce(v.ssm.housekeeper.lambda.timeout, local.raw_translated_experimental.ssm.housekeeper.lambda.timeout)
            }
            config = {
              tokenPath = try(coalesce(
                v.ssm.housekeeper.config.tokenPath,
                local.raw_translated_experimental.ssm.housekeeper.config.tokenPath,
              ), null)
              minimumDaysOld = coalesce(v.ssm.housekeeper.config.minimumDaysOld, local.raw_translated_experimental.ssm.housekeeper.config.minimumDaysOld)
              dryRun         = coalesce(v.ssm.housekeeper.config.dryRun, local.raw_translated_experimental.ssm.housekeeper.config.dryRun)
            }
          }
        })

        observability = {
          logs = {
            level             = coalesce(v.observability.logs.level, local.raw_translated_experimental.observability.logs.level)
            retention_in_days = coalesce(v.observability.logs.retention_in_days, local.raw_translated_experimental.observability.logs.retention_in_days)
            kms_key_id        = try(coalesce(v.observability.logs.kms_key_id, local.raw_translated_experimental.observability.logs.kms_key_id), null)
            class             = coalesce(v.observability.logs.class, local.raw_translated_experimental.observability.logs.class)
            tags              = merge(local.raw_translated_experimental.observability.logs.tags, v.observability.logs.tags)
          }
          tracing = {
            mode = try(coalesce(
              v.observability.tracing.mode,
              local.raw_translated_experimental.observability.tracing.mode,
            ), null)
            capture_http_requests = coalesce(v.observability.tracing.capture_http_requests, local.raw_translated_experimental.observability.tracing.capture_http_requests)
            capture_error         = coalesce(v.observability.tracing.capture_error, local.raw_translated_experimental.observability.tracing.capture_error)
          }
          metrics = {
            enable    = coalesce(v.observability.metrics.enable, local.raw_translated_experimental.observability.metrics.enable)
            namespace = coalesce(v.observability.metrics.namespace, local.raw_translated_experimental.observability.metrics.namespace)
            metric = {
              enable_github_app_rate_limit = coalesce(
                v.observability.metrics.metric.enable_github_app_rate_limit,
                local.raw_translated_experimental.observability.metrics.metric.enable_github_app_rate_limit,
              )
              enable_job_retry = coalesce(
                v.observability.metrics.metric.enable_job_retry,
                local.raw_translated_experimental.observability.metrics.metric.enable_job_retry,
              )
            }
          }
        }

        compute_provider = {
          aws = {
            ec2 = v.compute_provider.aws.ec2 == null ? null : merge(v.compute_provider.aws.ec2, {
              vpc_id                         = try(coalesce(v.compute_provider.aws.ec2.vpc_id, local.raw_translated_experimental.compute_provider.aws.ec2.vpc_id), null)
              subnet_ids                     = v.compute_provider.aws.ec2.subnet_ids != null ? v.compute_provider.aws.ec2.subnet_ids : local.raw_translated_experimental.compute_provider.aws.ec2.subnet_ids
              managed_security_group_enabled = coalesce(v.compute_provider.aws.ec2.managed_security_group_enabled, local.raw_translated_experimental.compute_provider.aws.ec2.managed_security_group_enabled)
              egress_rules                   = v.compute_provider.aws.ec2.egress_rules != null ? v.compute_provider.aws.ec2.egress_rules : local.raw_translated_experimental.compute_provider.aws.ec2.egress_rules
              additional_security_group_ids  = v.compute_provider.aws.ec2.additional_security_group_ids != null ? v.compute_provider.aws.ec2.additional_security_group_ids : local.raw_translated_experimental.compute_provider.aws.ec2.additional_security_group_ids
              instance_profile_path          = try(coalesce(v.compute_provider.aws.ec2.instance_profile_path, local.raw_translated_experimental.compute_provider.aws.ec2.instance_profile_path), null)
              key_name                       = try(coalesce(v.compute_provider.aws.ec2.key_name, local.raw_translated_experimental.compute_provider.aws.ec2.key_name), null)
              associate_public_ipv4_address  = coalesce(v.compute_provider.aws.ec2.associate_public_ipv4_address, local.raw_translated_experimental.compute_provider.aws.ec2.associate_public_ipv4_address)
              cloudwatch_agent = merge(v.compute_provider.aws.ec2.cloudwatch_agent, {
                config = try(coalesce(v.compute_provider.aws.ec2.cloudwatch_agent.config, local.raw_translated_experimental.compute_provider.aws.ec2.cloudwatch_agent.config), null)
              })
              binaries_syncer = {
                enabled = coalesce(v.compute_provider.aws.ec2.binaries_syncer.enabled, local.raw_translated_experimental.compute_provider.aws.ec2.runner_binaries.enabled)
              }
              tags = merge(local.raw_translated_experimental.compute_provider.aws.ec2.tags, v.compute_provider.aws.ec2.tags)
            })
            microvm = v.compute_provider.aws.microvm == null ? null : merge(v.compute_provider.aws.microvm, {
              image_arn     = try(coalesce(v.compute_provider.aws.microvm.image_arn, local.raw_translated_experimental.compute_provider.aws.microvm.image_arn), null)
              image_version = try(coalesce(v.compute_provider.aws.microvm.image_version, local.raw_translated_experimental.compute_provider.aws.microvm.image_version), null)
              ingress_network_connectors = v.compute_provider.aws.microvm.ingress_network_connectors != null ? (
                v.compute_provider.aws.microvm.ingress_network_connectors
              ) : local.raw_translated_experimental.compute_provider.aws.microvm.ingress_network_connectors
              egress_network_connectors = v.compute_provider.aws.microvm.egress_network_connectors != null ? (
                v.compute_provider.aws.microvm.egress_network_connectors
              ) : local.raw_translated_experimental.compute_provider.aws.microvm.egress_network_connectors
              maximum_duration_in_seconds = try(coalesce(
                v.compute_provider.aws.microvm.maximum_duration_in_seconds,
                local.raw_translated_experimental.compute_provider.aws.microvm.maximum_duration_in_seconds,
              ), null)
              environment_variables = merge(
                local.raw_translated_experimental.compute_provider.aws.microvm.environment_variables,
                v.compute_provider.aws.microvm.environment_variables,
              )
              iam = {
                resource_arns = {
                  images = v.compute_provider.aws.microvm.iam.resource_arns.images != null ? (
                    v.compute_provider.aws.microvm.iam.resource_arns.images
                  ) : local.raw_translated_experimental.compute_provider.aws.microvm.iam.resource_arns.images
                  microvms = v.compute_provider.aws.microvm.iam.resource_arns.microvms != null ? (
                    v.compute_provider.aws.microvm.iam.resource_arns.microvms
                  ) : local.raw_translated_experimental.compute_provider.aws.microvm.iam.resource_arns.microvms
                }
                additional_policy_json = {
                  scale_up = try(coalesce(
                    v.compute_provider.aws.microvm.iam.additional_policy_json.scale_up,
                    local.raw_translated_experimental.compute_provider.aws.microvm.iam.additional_policy_json.scale_up,
                  ), null)
                }
                managed_policies = {
                  scale_up = v.compute_provider.aws.microvm.iam.managed_policies.scale_up != null ? (
                    v.compute_provider.aws.microvm.iam.managed_policies.scale_up
                  ) : local.raw_translated_experimental.compute_provider.aws.microvm.iam.managed_policies.scale_up
                  pool = v.compute_provider.aws.microvm.iam.managed_policies.pool != null ? (
                    v.compute_provider.aws.microvm.iam.managed_policies.pool
                  ) : local.raw_translated_experimental.compute_provider.aws.microvm.iam.managed_policies.pool
                }
              }
            })
          }
        }
      })
    }
  })
}

locals {
  translated_experimental = merge(local.translated_experimental_base, {
    multi_runner_config = {
      for k, v in local.translated_experimental_base.multi_runner_config : k => merge(v, {
        runner = merge(v.runner, {
          labels = sort(setunion(
            v.runner.disable_default_labels ? [] : compact([
              "self-hosted",
              v.runner.os,
              v.runner.architecture,
            ]),
            v.orchestration_provider.webhook == null ? [] : flatten(v.orchestration_provider.webhook.matcherConfig.labelMatchers),
            compact(v.runner.extra_labels),
          ))
        })

        github = {
          enterprise_server = local.translated_experimental_base.github.enterprise_server
          user_agent        = local.translated_experimental_base.github.user_agent
        }

        lambda = merge(v.lambda, {
          artifact   = local.translated_experimental_base.lambda.artifact
          principals = local.translated_experimental_base.lambda.principals
        })

        orchestration_provider = {
          webhook = v.orchestration_provider.webhook == null ? null : merge(v.orchestration_provider.webhook, {
            queue = merge(v.orchestration_provider.webhook.queue, {
              kms_key_id = local.translated_experimental_base.orchestration_provider.webhook.queue.encryption.kms_master_key_id
            })

            lambda = merge(v.orchestration_provider.webhook.lambda, {
              artifact = local.translated_experimental_base.orchestration_provider.webhook.lambda.artifact
            })
          })
        }

        ssm = merge(v.ssm, {
          kms_key_id = local.translated_experimental_base.ssm.kms_key_id
        })

        compute_provider = merge(v.compute_provider, {
          aws = merge(v.compute_provider.aws, {
            ec2 = v.compute_provider.aws.ec2 == null ? null : merge(v.compute_provider.aws.ec2, {
              binaries_syncer = merge(v.compute_provider.aws.ec2.binaries_syncer, {
                s3 = v.compute_provider.aws.ec2.binaries_syncer.enabled ? local.runner_binaries_by_os_and_arch_map[
                  "${v.runner.os}_${v.runner.architecture}"
                ] : null
              })
            })
          })
        })
      })
    }
  })
}
