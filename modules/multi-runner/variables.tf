variable "github_app" {
  description = <<EOF
  GitHub app parameters for the stable v1 interface, see your github app.
  Omit this value when using the experimental v2 interface and provide the
  app through `global_config_github` instead.
  You can optionally create the SSM parameters yourself and provide the ARN and name here, through the `*_ssm` attributes.
  If you chose to provide the configuration values directly here,
  please ensure the key is the base64-encoded `.pem` file (the output of `base64 app.private-key.pem`, not the content of `private-key.pem`).
  Note: the provided SSM parameters arn and name have a precedence over the actual value (i.e `key_base64_ssm` has a precedence over `key_base64` etc).
  EOF
  type = object({
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
  })
  default = {}
}


variable "additional_github_apps" {
  description = <<-EOF
    Additional GitHub Apps for random API rate limit distribution.

    The primary app (var.github_app) is always included and is the one whose
    webhook secret is used for incoming webhook signature validation. Only the
    primary app needs a webhook configured in GitHub.

    Additional apps listed here are used exclusively by the control-plane
    lambdas (scale-up, scale-down, pool, job-retry) which randomly select an
    app for each GitHub API call. Each additional app must be installed on the
    same repositories/organizations as the primary app.
  EOF
  type = list(object({
    key_base64          = optional(string)
    key_base64_ssm      = optional(object({ arn = string, name = string }))
    id                  = optional(string)
    id_ssm              = optional(object({ arn = string, name = string }))
    installation_id     = optional(string)
    installation_id_ssm = optional(object({ arn = string, name = string }))
  }))
  default = []
}

variable "prefix" {
  description = "The prefix used for naming resources"
  type        = string
  default     = "github-actions"
}

variable "kms_key_arn" {
  description = "Optional CMK Key ARN to be used for Parameter Store."
  type        = string
  default     = null
}

variable "tags" {
  description = "Map of tags that will be added to created resources. By default resources will be tagged with name and environment."
  type        = map(string)
  default     = {}
}

# tflint-ignore: terraform_unused_declarations
variable "experimental_features" {
  description = <<-EOT
    Explicit acknowledgement for opt-in features whose schemas may change
    while experimental. Set to ["multi-runner-v2"] when using the v2
    provider-boundary configuration. This flag will become a deprecated no-op
    for one release when the feature graduates.
  EOT
  type        = set(string)
  default     = []

  validation {
    condition     = alltrue([for feature in var.experimental_features : feature == "multi-runner-v2"])
    error_message = "experimental_features contains an unsupported feature. The only supported value is \"multi-runner-v2\"."
  }
}

variable "multi_runner_config" {
  type = map(object({
    # V1 contract
    runner_config = optional(object({
      runner_os           = string
      runner_architecture = string
      runner_metadata_options = optional(map(any), {
        instance_metadata_tags      = "enabled"
        http_endpoint               = "enabled"
        http_tokens                 = "required"
        http_put_response_hop_limit = 1
      })
      ami = optional(object({
        filter               = optional(map(list(string)), { state = ["available"] })
        owners               = optional(list(string), ["amazon"])
        id_ssm_parameter_arn = optional(string, null)
        kms_key_arn          = optional(string, null)
      }), null)
      create_service_linked_role_spot      = optional(bool, false)
      credit_specification                 = optional(string, null)
      delay_webhook_event                  = optional(number, 30)
      disable_runner_autoupdate            = optional(bool, false)
      ebs_optimized                        = optional(bool, false)
      enable_ephemeral_runners             = optional(bool, false)
      enable_job_queued_check              = optional(bool, null)
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
      enable_organization_runners                                    = optional(bool, false)
      enable_runner_binaries_syncer                                  = optional(bool, true)
      enable_ssm_on_runners                                          = optional(bool, false)
      enable_userdata                                                = optional(bool, true)
      instance_allocation_strategy                                   = optional(string, "lowest-price")
      instance_type_priorities                                       = optional(map(number), null)
      instance_max_spot_price                                        = optional(string, null)
      instance_target_capacity_type                                  = optional(string, "spot")
      instance_types                                                 = list(string)
      job_queue_retention_in_seconds                                 = optional(number, 86400)
      minimum_running_time_in_minutes                                = optional(number, null)
      pool_runner_owner                                              = optional(string, null)
      runner_as_root                                                 = optional(bool, false)
      runner_boot_time_in_minutes                                    = optional(number, 5)
      scale_down_idle_confirmation_seconds                           = optional(number, 0)
      runner_disable_default_labels                                  = optional(bool, false)
      runner_extra_labels                                            = optional(list(string), [])
      runner_group_name                                              = optional(string, "Default")
      runner_name_prefix                                             = optional(string, "")
      runner_run_as                                                  = optional(string, "ec2-user")
      runners_maximum_count                                          = number
      runner_additional_security_group_ids                           = optional(list(string), [])
      scale_down_schedule_expression                                 = optional(string, "cron(*/5 * * * ? *)")
      scale_up_reserved_concurrent_executions                        = optional(number, 1)
      lambda_event_source_mapping_batch_size                         = optional(number, null)
      lambda_event_source_mapping_maximum_batching_window_in_seconds = optional(number, null)
      userdata_template                                              = optional(string, null)
      userdata_content                                               = optional(string, null)
      enable_jit_config                                              = optional(bool, null)
      enable_runner_detailed_monitoring                              = optional(bool, false)
      enable_cloudwatch_agent                                        = optional(bool, true)
      cloudwatch_config                                              = optional(string, null)
      userdata_pre_install                                           = optional(string, "")
      userdata_post_install                                          = optional(string, "")
      runner_hook_job_started                                        = optional(string, "")
      runner_hook_job_completed                                      = optional(string, "")
      runner_ec2_tags                                                = optional(map(string), {})
      runner_iam_role_managed_policy_arns                            = optional(list(string), [])
      vpc_id                                                         = optional(string, null)
      subnet_ids                                                     = optional(list(string), null)
      idle_config = optional(list(object({
        cron             = string
        timeZone         = string
        idleCount        = number
        evictionStrategy = optional(string, "oldest_first")
      })), [])
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
      runner_log_files = optional(list(object({
        log_group_name   = string
        prefix_log_group = bool
        file_path        = string
        log_stream_name  = string
        log_class        = optional(string, "STANDARD")
      })), null)
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
      pool_config = optional(list(object({
        schedule_expression          = string
        schedule_expression_timezone = optional(string)
        size                         = number
      })), [])
      job_retry = optional(object({
        enable             = optional(bool, false)
        delay_in_seconds   = optional(number, 300)
        delay_backoff      = optional(number, 2)
        lambda_memory_size = optional(number, 256)
        lambda_timeout     = optional(number, 30)
        max_attempts       = optional(number, 1)
      }), {})
      iam_overrides = optional(object({
        override_instance_profile = optional(bool, null)
        instance_profile_name     = optional(string, null)
        override_runner_role      = optional(bool, null)
        runner_role_arn           = optional(string, null)
        }), {
        override_instance_profile = false
        instance_profile_name     = null
        override_runner_role      = false
        runner_role_arn           = null
      })
    }), null)
    matcherConfig = optional(object({
      labelMatchers           = list(list(string))
      exactMatch              = optional(bool, false)
      bidirectionalLabelMatch = optional(bool, false)
      priority                = optional(number, 999)
      enableDynamicLabels     = optional(bool, false)
      awsDynamicLabelsPolicy  = optional(any, null)
    }), null)
    redrive_build_queue = optional(object({
      enabled         = bool
      maxReceiveCount = number
      }), {
      enabled         = false
      maxReceiveCount = null
    })

    # V2 Contract
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

    orchestration_provider = optional(object({
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
        matcherConfig = optional(object({
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
        }), null)
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
              idle_confirmation_seconds       = optional(number, null)
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
      scale_set = optional(object({
        github = object({
          config_url = string
          installation_id_ssm = object({
            name        = string
            arn         = string
            kms_key_arn = optional(string, null)
          })
          force_ghes = optional(bool, null)
        })
        name                 = string
        id                   = number
        runner_group_id      = optional(number, null)
        min_runners          = optional(number, 0)
        max_runners          = optional(number, 10)
        boot_time_in_minutes = optional(number, 10)
        session_owner        = optional(string, null)
        work_folder          = optional(string, null)
      }), null)
    }), {})

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

    compute_provider = optional(object({
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
          })), [{ volume_size = 30 }])
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
          instance_types                 = optional(list(string), [])
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
      }), {})
    }), {})
  }))
  default     = {}
  description = <<EOT
    Accepts either the stable v1 runner configuration shape or the provider-boundary v2 shape. Entries with `runner_config` use the v1 shape; entries without `runner_config` use the v2 shape. A v2 entry does not need matcher configuration. A v2 entry must be acknowledged with `experimental_features = ["multi-runner-v2"]`; the v2 shape is experimental and may change before graduation.

    multi_runner_config = {
      runner_config: {
        runner_os: "The EC2 Operating System type to use for action runner instances (linux, osx, windows)."
        runner_architecture: "The platform architecture of the runner instance_type."
        runner_metadata_options: "(Optional) Metadata options for the ec2 runner instances."
        ami: "(Optional) AMI configuration for the action runner instances. This object allows you to specify all AMI-related settings in one place."
        create_service_linked_role_spot: (Optional) create the serviced linked role for spot instances that is required by the scale-up lambda.
        credit_specification: "(Optional) The credit specification of the runner instance_type. Can be unset, `standard` or `unlimited`.
        delay_webhook_event: "The number of seconds the event accepted by the webhook is invisible on the queue before the scale up lambda will receive the event."
        disable_runner_autoupdate: "Disable the auto update of the github runner agent. Be aware there is a grace period of 30 days, see also the [GitHub article](https://github.blog/changelog/2022-02-01-github-actions-self-hosted-runners-can-now-disable-automatic-updates/)"
        ebs_optimized: "The EC2 EBS optimized configuration."
        enable_ephemeral_runners: "Enable ephemeral runners, runners will only be used once."
        enable_job_queued_check: Enables JIT configuration for creating runners instead of registration token based registraton. JIT configuration will only be applied for ephemeral runners. By default JIT configuration is enabled for ephemeral runners an can be disabled via this override. When running on GHES without support for JIT configuration this variable should be set to true for ephemeral runners."
        enable_on_demand_failover_for_errors: "Enable on-demand failover. For example to fall back to on demand when no spot capacity is available the variable can be set to `InsufficientInstanceCapacity`. When not defined the default behavior is to retry later."
        scale_errors: "List of AWS error codes that should trigger retry during scale up. This list replaces the module default scale-up retry errors"
        enable_organization_runners: "Register runners to organization, instead of repo level"
        enable_runner_binaries_syncer: "Option to disable the lambda to sync GitHub runner distribution, useful when using a pre-build AMI."
        enable_ssm_on_runners: "Enable to allow access the runner instances for debugging purposes via SSM. Note that this adds additional permissions to the runner instances."
        enable_userdata: "Should the userdata script be enabled for the runner. Set this to false if you are using your own prebuilt AMI."
        instance_allocation_strategy: "The allocation strategy for creating instances. For spot, AWS recommends `price-capacity-optimized`; for on-demand, use `lowest-price` or `prioritized`. The AWS default is `lowest-price`."
        instance_type_priorities: "A map of instance type to priority for the `prioritized` and `capacity-optimized-prioritized` allocation strategies. Lower numbers mean higher priority. If not provided, priorities are assigned based on the order of `instance_types`."
        instance_max_spot_price: "Max price price for spot instances per hour. This variable will be passed to the create fleet as max spot price for the fleet."
        instance_target_capacity_type: "Default lifecycle used for runner instances, can be either `spot` or `on-demand`."
        instance_types: "List of instance types for the action runner. Defaults are based on runner_os (al2023 for linux, macOS Sequoia for osx, Windows Server Core for win)."
        job_queue_retention_in_seconds: "The number of seconds the job is held in the queue before it is purged"
        minimum_running_time_in_minutes: "The time an ec2 action runner should be running at minimum before terminated if not busy."
        pool_runner_owner: "The pool will deploy runners to the GitHub org ID, set this value to the org to which you want the runners deployed. Repo level is not supported."
        runner_additional_security_group_ids: "List of additional security groups IDs to apply to the runner. If added outside the multi_runner_config block, the additional security group(s) will be applied to all runner configs. If added inside the multi_runner_config, the additional security group(s) will be applied to the individual runner."
        runner_as_root: "Run the action runner under the root user. Variable `runner_run_as` will be ignored."
        runner_boot_time_in_minutes: "The minimum time for an EC2 runner to boot and register as a runner."
        scale_down_idle_confirmation_seconds: "Number of seconds a runner must consistently report not-busy before scale-down terminates it. GitHub's busy flag can be stale, so a single not-busy reading is not sufficient evidence a runner is idle. 0 keeps the previous single-reading behaviour."
        runner_disable_default_labels: "Disable default labels for the runners (os, architecture and `self-hosted`). If enabled, the runner will only have the extra labels provided in `runner_extra_labels`. In case you on own start script is used, this configuration parameter needs to be parsed via SSM."
        runner_extra_labels: "Extra (custom) labels for the runners (GitHub). Separate each label by a comma. Labels checks on the webhook can be enforced by setting `multi_runner_config.matcherConfig.exactMatch`. GitHub read-only labels should not be provided."
        runner_group_name: "Name of the runner group."
        runner_name_prefix: "Prefix for the GitHub runner name."
        runner_run_as: "Run the GitHub actions agent as user."
        runners_maximum_count: "The maximum number of runners that will be created. Setting the variable to `-1` disables the maximum check."
        scale_down_schedule_expression: "Scheduler expression to check every x for scale down."
        scale_up_reserved_concurrent_executions: "Amount of reserved concurrent executions for the scale-up lambda function. A value of 0 disables lambda from being triggered and -1 removes any concurrency limitations."
        lambda_event_source_mapping_batch_size: "(Optional) Maximum number of records per Lambda invocation for this runner flavor. Overrides the module-level `lambda_event_source_mapping_batch_size` when set."
        lambda_event_source_mapping_maximum_batching_window_in_seconds: "(Optional) Maximum seconds to gather records before invoking Lambda for this runner flavor. Overrides the module-level `lambda_event_source_mapping_maximum_batching_window_in_seconds` when set."
        userdata_template: "Alternative user-data template, replacing the default template. By providing your own user_data you have to take care of installing all required software, including the action runner. Variables userdata_pre/post_install are ignored."
        enable_jit_config: "Overwrite the default behavior for JIT configuration. By default JIT configuration is enabled for ephemeral runners and disabled for non-ephemeral runners. In case of GHES check first if the JIT config API is available. In case you are upgrading from 3.x to 4.x you can set `enable_jit_config` to `false` to avoid a breaking change when having your own AMI."
        enable_runner_detailed_monitoring: "Should detailed monitoring be enabled for the runner. Set this to true if you want to use detailed monitoring. See https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-cloudwatch-new.html for details."
        enable_cloudwatch_agent: "Enabling the cloudwatch agent on the ec2 runner instances, the runner contains default config. Configuration can be overridden via `cloudwatch_config`."
        cloudwatch_config: "(optional) Replaces the module default cloudwatch log config. See https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html for details."
        userdata_pre_install: "Script to be ran before the GitHub Actions runner is installed on the EC2 instances"
        userdata_post_install: "Script to be ran after the GitHub Actions runner is installed on the EC2 instances"
        runner_hook_job_started: "Script to be ran in the runner environment at the beginning of every job"
        runner_hook_job_completed: "Script to be ran in the runner environment at the end of every job"
        runner_ec2_tags: "Map of tags that will be added to the launch template instance tag specifications."
        runner_iam_role_managed_policy_arns: "Attach AWS or customer-managed IAM policies (by ARN) to the runner IAM role"
        vpc_id: "The VPC for security groups of the action runners. If not set uses the value of `var.vpc_id`."
        subnet_ids: "List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`. If not set, uses the value of `var.subnet_ids`."
        idle_config: "List of time period that can be defined as cron expression to keep a minimum amount of runners active instead of scaling down to 0. By defining this list you can ensure that in time periods that match the cron expression within 5 seconds a runner is kept idle."
        license_specifications: "Optional EC2 License Manager license configuration ARNs for the runner launch template. Required for macOS dedicated-host runners when the host resource group uses a Mac dedicated host license configuration."
        use_dedicated_host: "Experimental! Can be removed / changed without trigger a major release. Whether to use EC2 dedicated hosts for the runners. Needed for macos runners Note that using dedicated hosts can increase cost significantly."
        runner_log_files: "(optional) Replaces the module default cloudwatch log config. See https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html for details."
        block_device_mappings: "The EC2 instance block device configuration. Takes the following keys: `device_name`, `delete_on_termination`, `volume_type`, `volume_size`, `encrypted`, `iops`, `throughput`, `kms_key_id`, `snapshot_id`, `volume_initialization_rate`."
        job_retry: "Experimental! Can be removed / changed without trigger a major release. Configure job retries. The configuration enables job retries (for ephemeral runners). After creating the instances a message will be published to a job retry queue. The job retry check lambda is checking after a delay if the job is queued. If not the message will be published again on the scale-up (build queue). Using this feature can impact the rate limit of the GitHub app."
        pool_config: "The configuration for updating the pool. The `pool_size` to adjust to by the events triggered by the `schedule_expression`. For example you can configure a cron expression for week days to adjust the pool to 10 and another expression for the weekend to adjust the pool to 1. Use `schedule_expression_timezone` to override the schedule time zone (defaults to UTC)."
        iam_overrides: "Allows to (optionally) override the instance profile and runner role created by the module. Set `override_instance_profile` to true and provide the `instance_profile_name` to use an existing instance profile. Set `override_runner_role` to true and provide the `runner_role_arn` to use an existing role for the runner instances."
      }
      # V2 contract
      tags: "Tags applied to resources created for this runner configuration."
      runner: "Runner settings such as the operating system, architecture, labels, hooks, runner group, name prefix, and IAM role configuration."
      lambda: "Lambda settings such as runtime, architecture, networking, tags, and execution-role options for this runner configuration."
      # Webhook, queue, and scale-up/scale-down orchestration settings.
      orchestration_provider: {
        webhook: {
          matcherConfig: "Label matching and dynamic-label policy used to route workflow jobs to this runner configuration."
          runner: "Runner lifecycle settings including boot time, ephemeral mode, JIT configuration, and maximum runner count."
          queue: "Build queue delay, retention, visibility timeout, redrive, and tags."
        }
      }
      ssm: "SSM parameter paths, tags, and housekeeper settings for runner configuration storage."
      observability: "Logging, tracing, and metric settings for the resources in this runner configuration."
      # Compute settings for the runner provider.
      compute_provider: {
        aws: {
          ec2: "AWS EC2 runner settings, including AMI selection, instance types, capacity strategy, VPC and subnet placement, storage, user data, and runner access."
        }
      }
      matcherConfig: {
        labelMatchers: "The list of list of labels supported by the runner configuration. `[[self-hosted, linux, x64, example]]`"
        exactMatch: "DEPRECATED: Use `bidirectionalLabelMatch` instead. If set to true all labels in the workflow job must match the GitHub labels (os, architecture and `self-hosted`). When false if __any__ workflow label matches it will trigger the webhook. Note: this only checks that workflow labels are a subset of runner labels, not the reverse."
        bidirectionalLabelMatch: "If set to true, the runner labels and workflow job labels must be an exact two-way match (same set, any order, no extras or missing labels). This is stricter than `exactMatch` which only checks that workflow labels are a subset of runner labels. When false, if __any__ workflow label matches it will trigger the webhook."
        priority: "If set it defines the priority of the matcher, the matcher with the lowest priority will be evaluated first. Default is 999, allowed values 0-999."
        enableDynamicLabels: "Experimental! When true the dispatcher allows `ghr-*` dynamic labels for jobs routed to this runner. Default false."
        awsDynamicLabelsPolicy: "Optional AWS dynamic label policy evaluated by the dispatcher. Only effective when `enableDynamicLabels = true`. Jobs whose provider dynamic labels violate every matching runner's policy are rejected with a 202 (a warning is logged). Evaluation: keys in `blocked_keys` are always rejected; keys in `restricted_keys` are allowed only when their value passes the rule; unlisted keys are allowed. Schema: `{ blocked_keys = [<key>], restricted_keys = { <key> = { allowed = [globs], denied = [globs], max = number|string } } }`. Keys use the dynamic label suffix, e.g. `instance-type` for `ghr-ec2-instance-type`."
      }
      redrive_build_queue: "Set options to attach (optional) a dead letter queue to the build queue, the queue between the webhook and the scale up lambda. You have the following options. 1. Disable by setting `enabled` to false. 2. Enable by setting `enabled` to `true`, `maxReceiveCount` to a number of max retries."
    }
  EOT

  validation {
    condition = (
      length([for config in var.multi_runner_config : config if can(config.runner_config.runner_os)]) == 0
      || length([for config in var.multi_runner_config : config if !can(config.runner_config.runner_os)]) == 0
    )
    error_message = "Use one multi_runner_config shape per module invocation: provide either v1 entries with runner_config or v2 entries without runner_config, not both in the same map."
  }
}

variable "scale_up_lambda_memory_size" {
  description = "Memory size limit in MB for scale_up lambda."
  type        = number
  default     = 512
}

variable "runners_scale_up_lambda_timeout" {
  description = "Time out for the scale up lambda in seconds."
  type        = number
  default     = 30
}

variable "scale_down_lambda_memory_size" {
  description = "Memory size limit in MB for scale down."
  type        = number
  default     = 512
}

variable "runners_scale_down_lambda_timeout" {
  description = "Time out for the scale down lambda in seconds."
  type        = number
  default     = 60
}

variable "webhook_lambda_zip" {
  description = "File location of the webhook lambda zip file."
  type        = string
  default     = null
}

variable "webhook_lambda_memory_size" {
  description = "Memory size limit in MB for webhook lambda."
  type        = number
  default     = 256
}

variable "webhook_lambda_timeout" {
  description = "Time out of the lambda in seconds."
  type        = number
  default     = 10
}

variable "role_permissions_boundary" {
  description = "Permissions boundary that will be added to the created role for the lambda."
  type        = string
  default     = null
}

variable "role_path" {
  description = "The path that will be added to the role; if not set, the environment name will be used."
  type        = string
  default     = null
}

variable "logging_retention_in_days" {
  description = "Specifies the number of days you want to retain log events for the lambda log group. Possible values are: 0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653."
  type        = number
  default     = 180
}

variable "logging_kms_key_id" {
  description = "Specifies the kms key id to encrypt the logs with"
  type        = string
  default     = null
}

variable "log_class" {
  description = "The log class of the CloudWatch log groups. Valid values are `STANDARD` or `INFREQUENT_ACCESS`."
  type        = string
  default     = "STANDARD"
}

variable "lambda_s3_bucket" {
  description = "S3 bucket from which to specify lambda functions. This is an alternative to providing local files directly."
  type        = string
  default     = null
}

variable "webhook_lambda_s3_key" {
  description = "S3 key for webhook lambda function. Required if using S3 bucket to specify lambdas."
  type        = string
  default     = null
}

variable "webhook_lambda_s3_object_version" {
  description = "S3 object version for webhook lambda function. Useful if S3 versioning is enabled on source bucket."
  type        = string
  default     = null
}

variable "webhook_lambda_apigateway_access_log_settings" {
  description = "Access log settings for webhook API gateway."
  type = object({
    destination_arn = string
    format          = string
  })
  default = null
}

variable "repository_white_list" {
  description = "List of github repository full names (owner/repo_name) that will be allowed to use the github app. Leave empty for no filtering."
  type        = list(string)
  default     = []
}

variable "queue_selection_strategy" {
  description = "Strategy used to pick a queue when multiple runner configurations match a job equally well. `first` keeps the historical deterministic behaviour (the first matching queue by priority). `random` spreads jobs across the matching queues to avoid concentrating load on a single one. `all` scales up one runner per matching queue and lets the first to become available take the job (favouring speed over cost; this multiplies instance launches and runner registrations per job)."
  type        = string
  default     = "first"
}

variable "log_level" {
  description = "Logging level for lambda logging. Valid values are  'silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'."
  type        = string
  default     = "info"
}

variable "lambda_runtime" {
  description = "AWS Lambda runtime."
  type        = string
  default     = "nodejs24.x"
}

variable "lambda_architecture" {
  description = "AWS Lambda architecture. Lambda functions using Graviton processors ('arm64') tend to have better price/performance than 'x86_64' functions. "
  type        = string
  default     = "arm64"
}

variable "syncer_lambda_s3_key" {
  description = "S3 key for syncer lambda function. Required if using S3 bucket to specify lambdas."
  type        = string
  default     = null
}

variable "lambda_principals" {
  description = "(Optional) add extra principals to the role created for execution of the lambda, e.g. for local testing."
  type = list(object({
    type        = string
    identifiers = list(string)
  }))
  default = []
}

variable "runner_binaries_s3_sse_configuration" {
  description = "Map containing server-side encryption configuration for runner-binaries S3 bucket."
  type        = any
  default = {
    rule = {
      apply_server_side_encryption_by_default = {
        sse_algorithm = "AES256"
      }
    }
  }
}

variable "runner_binaries_s3_tags" {
  description = "Map of tags that will be added to the S3 bucket. Note these are additional tags to the default tags."
  type        = map(string)
  default     = {}
}

variable "runner_binaries_s3_versioning" {
  description = "Status of S3 versioning for runner-binaries S3 bucket. Once set to Enabled the change cannot be reverted via Terraform!"
  type        = string
  default     = "Disabled"
}

variable "runner_binaries_syncer_memory_size" {
  description = "Memory size limit in MB for binary syncer lambda."
  type        = number
  default     = 256
}

variable "runner_binaries_syncer_lambda_timeout" {
  description = "Time out of the binaries sync lambda in seconds."
  type        = number
  default     = 300
}

variable "runner_binaries_syncer_lambda_zip" {
  description = "File location of the binaries sync lambda zip file."
  type        = string
  default     = null
}

variable "syncer_lambda_s3_object_version" {
  description = "S3 object version for syncer lambda function. Useful if S3 versioning is enabled on source bucket."
  type        = string
  default     = null
}

variable "state_event_rule_binaries_syncer" {
  type        = string
  description = "Option to disable EventBridge Lambda trigger for the binary syncer, useful to stop automatic updates of binary distribution"
  default     = "ENABLED"
}

variable "queue_encryption" {
  description = "Configure how data on queues managed by the modules in ecrypted at REST. Options are encrypted via SSE, non encrypted and via KMSS. By default encryptes via SSE is enabled. See for more details the Terraform `aws_sqs_queue` resource https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue."
  type = object({
    kms_data_key_reuse_period_seconds = number
    kms_master_key_id                 = string
    sqs_managed_sse_enabled           = bool
  })
  default = {
    kms_data_key_reuse_period_seconds = null
    kms_master_key_id                 = null
    sqs_managed_sse_enabled           = true
  }
}

variable "aws_partition" {
  description = "(optiona) partition in the arn namespace to use if not 'aws'"
  type        = string
  default     = "aws"
}

variable "aws_region" {
  description = "AWS region."
  type        = string
}

variable "vpc_id" {
  description = "The VPC for security groups of stable v1 action runners. Omit when using the experimental v2 interface."
  type        = string
  default     = null
}

variable "subnet_ids" {
  description = "List of subnets in which stable v1 action runners will be launched. Omit when using the experimental v2 interface."
  type        = list(string)
  default     = null
}

variable "enable_managed_runner_security_group" {
  description = "Enabling the default managed security group creation. Unmanaged security groups can be specified via `runner_additional_security_group_ids`."
  type        = bool
  default     = true
}

variable "runner_egress_rules" {
  description = "List of egress rules for the GitHub runner instances."
  type = list(object({
    cidr_blocks      = list(string)
    ipv6_cidr_blocks = list(string)
    prefix_list_ids  = list(string)
    from_port        = number
    protocol         = string
    security_groups  = list(string)
    self             = bool
    to_port          = number
    description      = string
  }))
  default = [{
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
    prefix_list_ids  = null
    from_port        = 0
    protocol         = "-1"
    security_groups  = null
    self             = null
    to_port          = 0
    description      = null
  }]
}

variable "runner_additional_security_group_ids" {
  description = "(optional) List of additional security groups IDs to apply to the runner"
  type        = list(string)
  default     = []
}

variable "runners_lambda_s3_key" {
  description = "S3 key for runners lambda function. Required if using S3 bucket to specify lambdas."
  type        = string
  default     = null
}

variable "runners_lambda_s3_object_version" {
  description = "S3 object version for runners lambda function. Useful if S3 versioning is enabled on source bucket."
  type        = string
  default     = null
}

variable "runners_lambda_zip" {
  description = "File location of the lambda zip file for scaling runners."
  type        = string
  default     = null
}


variable "lambda_subnet_ids" {
  description = "List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`."
  type        = list(string)
  default     = []
}

variable "lambda_security_group_ids" {
  description = "List of security group IDs associated with the Lambda function."
  type        = list(string)
  default     = []
}

variable "cloudwatch_config" {
  description = "(optional) Replaces the module default cloudwatch log config. See https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html for details."
  type        = string
  default     = null
}

variable "instance_profile_path" {
  description = "The path that will be added to the instance_profile, if not set the environment name will be used."
  type        = string
  default     = null
}

variable "key_name" {
  description = "Key pair name"
  type        = string
  default     = null
}

variable "ghes_url" {
  description = "GitHub Enterprise Server URL. Example: https://github.internal.co - DO NOT SET IF USING PUBLIC GITHUB. .However if you are using GitHub Enterprise Cloud with data-residency (ghe.com), set the endpoint here. Example - https://companyname.ghe.com|"
  type        = string
  default     = null
}

variable "ghes_ssl_verify" {
  description = "GitHub Enterprise SSL verification. Set to 'false' when custom certificate (chains) is used for GitHub Enterprise Server (insecure)."
  type        = bool
  default     = true
}

variable "pool_lambda_timeout" {
  description = "Time out for the pool lambda in seconds."
  type        = number
  default     = 60
}

variable "pool_lambda_reserved_concurrent_executions" {
  description = "Amount of reserved concurrent executions for the scale-up lambda function. A value of 0 disables lambda from being triggered and -1 removes any concurrency limitations."
  type        = number
  default     = 1
}

variable "ssm_paths" {
  description = "The root path used in SSM to store configuration and secrets."
  type = object({
    root    = optional(string, "github-action-runners")
    app     = optional(string, "app")
    runners = optional(string, "runners")
    webhook = optional(string, "webhook")
  })
  default = {}
}

variable "tracing_config" {
  description = "Configuration for lambda tracing."
  type = object({
    mode                  = optional(string, null)
    capture_http_requests = optional(bool, false)
    capture_error         = optional(bool, false)
  })
  default = {}
}

variable "associate_public_ipv4_address" {
  description = "Associate public IPv4 with the runner. Only tested with IPv4"
  type        = bool
  default     = false
}

variable "runners_ssm_housekeeper" {
  description = <<EOF
  Configuration for the SSM housekeeper lambda. This lambda deletes token / JIT config from SSM.

  `schedule_expression`: is used to configure the schedule for the lambda.
  `enabled`: enable or disable the lambda trigger via the EventBridge.
  `lambda_memory_size`: lambda memory size limit.
  `lambda_timeout`: timeout for the lambda in seconds.
  `config`: configuration for the lambda function. Token path will be read by default from the module.
  EOF
  type = object({
    schedule_expression = optional(string, "rate(1 day)")
    enabled             = optional(bool, true)
    lambda_memory_size  = optional(number, 512)
    lambda_timeout      = optional(number, 60)
    config = object({
      tokenPath      = optional(string)
      minimumDaysOld = optional(number, 1)
      dryRun         = optional(bool, false)
    })
  })
  default = { config = {} }
}

variable "instance_termination_watcher" {
  description = <<-EOF
    Configuration for the spot termination watcher lambda function. This feature is Beta, changes will not trigger a major release as long in beta.

    `enable`: Enable or disable the spot termination watcher.
    `enable_runner_deregistration`: Enable or disable deregistering the runner from GitHub when its EC2 instance is terminated.
    `environment_variables`: Additional environment variables to merge into the Lambda configuration.
    `memory_size`: Memory size limit in MB of the lambda.
    `s3_key`: S3 key for syncer lambda function. Required if using S3 bucket to specify lambdas.
    `s3_object_version`: S3 object version for syncer lambda function. Useful if S3 versioning is enabled on source bucket.
    `timeout`: Time out of the lambda in seconds.
    `zip`: File location of the lambda zip file.
  EOF

  type = object({
    enable = optional(bool, false)
    features = optional(object({
      enable_spot_termination_handler              = optional(bool, true)
      enable_spot_termination_notification_watcher = optional(bool, true)
    }), {})
    enable_runner_deregistration = optional(bool, true)
    environment_variables        = optional(map(string), {})
    memory_size                  = optional(number, null)
    s3_key                       = optional(string, null)
    s3_object_version            = optional(string, null)
    timeout                      = optional(number, null)
    zip                          = optional(string, null)
  })
  default = {}
}

variable "lambda_tags" {
  description = "Map of tags that will be added to all the lambda function resources. Note these are additional tags to the default tags."
  type        = map(string)
  default     = {}
}

variable "matcher_config_parameter_store_tier" {
  description = "The tier of the parameter store for the matcher configuration. Valid values are `Standard`, and `Advanced`."
  type        = string
  default     = "Standard"
}

variable "metrics" {
  description = "Configuration for metrics created by the module, by default metrics are disabled to avoid additional costs. When metrics are enable all metrics are created unless explicit configured otherwise."
  type = object({
    enable    = optional(bool, false)
    namespace = optional(string, "GitHub Runners")
    metric = optional(object({
      enable_github_app_rate_limit    = optional(bool, true)
      enable_job_retry                = optional(bool, true)
      enable_spot_termination_warning = optional(bool, true)
    }), {})
  })
  default = {}
}

variable "eventbridge" {
  description = "Enable the use of EventBridge by the module. By enabling this feature events will be put on the EventBridge by the webhook instead of directly dispatching to queues for scaling."
  type = object({
    enable        = optional(bool, true)
    accept_events = optional(list(string), [])
  })

  default = {}
}

variable "user_agent" {
  description = "User agent used for API calls by lambda functions."
  type        = string
  default     = "github-aws-runners"
}

# tflint-ignore: terraform_unused_declarations
variable "iam_overrides" {
  description = "This map provides the possibility to override some IAM defaults. The following attributes are supported: `instance_profile_name` overrides the instance profile name used in the launch template. `runner_role_arn` overrides the IAM role ARN used for the runner instances."
  type = object({
    override_instance_profile = optional(bool, null)
    instance_profile_name     = optional(string, null)
    override_runner_role      = optional(bool, null)
    runner_role_arn           = optional(string, null)
  })

  default = {
    override_instance_profile = false
    instance_profile_name     = null
    override_runner_role      = false
    runner_role_arn           = null
  }
}

variable "lambda_event_source_mapping_batch_size" {
  description = "Maximum number of records to pass to the lambda function in a single batch for the event source mapping. When not set, the AWS default of 10 events will be used."
  type        = number
  default     = 10
}

variable "lambda_event_source_mapping_maximum_batching_window_in_seconds" {
  description = "Maximum amount of time to gather records before invoking the lambda function, in seconds. AWS requires this to be greater than 0 if batch_size is greater than 10. Defaults to 0."
  type        = number
  default     = 0
}

variable "parameter_store_tags" {
  description = "Map of tags that will be added to all the SSM Parameter Store parameters created by the Lambda function."
  type        = map(string)
  default     = {}
}
