variable "experimental" {
  description = <<-EOT
    Opt-in experimental features. Omit this object to retain only the stable `multi_runner_config` behavior. Experimental schemas can change before they become stable.

    - `multi_runner_config_v2`: Provider-oriented runner configurations keyed by configuration name. To opt into v2, leave `multi_runner_config` empty and populate this map. When this map is empty, stable `multi_runner_config` entries continue to use the unchanged `runners` module. Populating both maps in the same module instance is unsupported.

    Each `multi_runner_config_v2` entry supports the following nested fields:

    - `tags`: Configuration-wide tags. These override module-level `tags`; narrower component and compute-provider tag maps take precedence for their resources.
    - `runner.os`: Runner operating system.
    - `runner.architecture`: Runner distribution architecture.
    - `runner.boot_time_in_minutes`: Expected boot duration used before a runner is considered stale.
    - `runner.disable_default_labels`: Prevents GitHub default labels from being registered.
    - `runner.extra_labels`: Additional labels combined with `matcherConfig.labelMatchers`. Default self-hosted, operating-system, and architecture labels are also included unless `runner.disable_default_labels` is true.
    - `runner.group_name`: GitHub runner group used during registration.
    - `runner.name_prefix`: Prefix added to registered runner names.
    - `runner.run_as_root`: Runs the runner service as root when supported by the compute provider.
    - `runner.run_as`: Operating-system user used when `run_as_root` is false.
    - `runner.maximum_count`: Maximum number of runners for this configuration.
    - `runner.ephemeral`: Registers runners in ephemeral mode.
    - `runner.jit_config_enabled`: Explicitly enables or disables just-in-time configuration. Null follows `ephemeral`.
    - `runner.auto_update_disabled`: Disables the GitHub runner application's built-in updater.
    - `runner.tags`: Tags for common runner resources, currently the managed runner IAM role. These override entry-level `tags`.
    - `runner.hooks.job_started`: Script content installed as the runner job-started hook.
    - `runner.hooks.job_completed`: Script content installed as the runner job-completed hook.
    - `runner.iam.role.arn`: ARN of an externally managed runner role. When set, `runner-stack` does not create or modify that role.
    - `runner.iam.managed_policy_arns`: Named managed-policy ARNs attached to the module-managed runner role.
    - `runner.iam.path`: IAM path for the module-managed runner role.
    - `runner.iam.permissions_boundary`: Permissions-boundary ARN for the module-managed runner role.
    - `github.organization_runners`: Registers runners at organization scope when true; otherwise repository-scoped registration is used.
    - `lambda.tags`: Shared tags for control-plane Lambda functions. Component tags override this map.
    - `queue.delay_webhook_event`: Delay in seconds applied to webhook job messages.
    - `queue.job_queue_retention_in_seconds`: Build-queue message retention period in seconds.
    - `queue.event_source_mapping.batch_size`: Maximum build-queue records delivered to one scale-up Lambda invocation. Null uses the module-level setting.
    - `queue.event_source_mapping.maximum_batching_window_in_seconds`: Maximum batching window for build-queue records. Null uses the module-level setting.
    - `queue.redrive_build_queue.enabled`: Creates and attaches a dead-letter queue for the build queue.
    - `queue.redrive_build_queue.maxReceiveCount`: Number of receives before a build message moves to the dead-letter queue.
    - `queue.tags`: Tags for configuration-owned queue resources. These override entry-level `tags`; component tags override this map.
    - `scale_up.reserved_concurrent_executions`: Reserved concurrency for the scale-up Lambda. Use `-1` for unreserved concurrency.
    - `scale_up.job_queued_check_enabled`: Enables the queued-job verification before scaling. Null follows the runner mode default.
    - `scale_up.tags`: Tags for scale-up resources. These override entry-level and shared Lambda, queue, and log-group tags within their resource scopes.
    - `scale_down.schedule_expression`: EventBridge schedule expression that invokes scale-down.
    - `scale_down.minimum_running_time_in_minutes`: Minimum runner age before scale-down may terminate it. Null selects the operating-system default.
    - `scale_down.tags`: Tags for scale-down resources. These override entry-level and shared Lambda and log-group tags within their resource scopes.
    - `scale_down.idle_config`: Time-based desired idle-runner configurations.
    - `scale_down.idle_config[].cron`: Cron expression identifying when the idle configuration applies.
    - `scale_down.idle_config[].timeZone`: IANA time zone used to evaluate `cron`.
    - `scale_down.idle_config[].idleCount`: Number of idle runners to retain during the matching period.
    - `scale_down.idle_config[].evictionStrategy`: Selection strategy used when excess idle runners are removed.
    - `pool.config`: Scheduled target pool sizes. An empty list disables the pool component.
    - `pool.config[].schedule_expression`: Scheduler expression that activates the target size.
    - `pool.config[].schedule_expression_timezone`: Optional IANA time zone used to evaluate the schedule.
    - `pool.config[].size`: Desired number of runners for the schedule.
    - `pool.runner_owner`: Optional GitHub organization or repository owner used when creating pooled runners.
    - `pool.tags`: Tags for pool resources. These override entry-level and shared Lambda and log-group tags within their resource scopes.
    - `job_retry.enabled`: Creates the retry queue, Lambda function, event-source mapping, and related IAM resources.
    - `job_retry.delay_in_seconds`: Initial delay before a queued-job retry check.
    - `job_retry.delay_backoff`: Multiplier applied to the delay after each unsuccessful check.
    - `job_retry.max_attempts`: Maximum retry-check attempts before the message is no longer republished.
    - `job_retry.tags`: Tags for job-retry resources. These override entry-level and shared Lambda, queue, and log-group tags within their resource scopes.
    - `job_retry.lambda.memory_size`: Memory allocated to the job-retry Lambda in MB.
    - `job_retry.lambda.reserved_concurrent_executions`: Reserved concurrency for the job-retry Lambda. Use `-1` for unreserved concurrency.
    - `job_retry.lambda.timeout`: Job-retry Lambda timeout in seconds and visibility timeout for its retry queue.
    - `ssm.tags`: Shared tags for SSM-related resources. These override entry-level `tags`.
    - `ssm.kms_key`: Optional customer-managed KMS key used for temporary registration parameters. The wrapper's presence selects the KMS policy at plan time.
    - `ssm.kms_key.arn`: ARN of the customer-managed KMS key. The ARN may be unknown until apply.
    - `ssm.parameters.tags`: Tags for Terraform-managed and runtime-created runner configuration parameters. These override `ssm.tags`.
    - `ssm.housekeeper.tags`: Tags for SSM housekeeper resources. These override entry-level, shared Lambda, shared log, and `ssm.tags` values.
    - `observability.logs.tags`: Shared tags for CloudWatch log groups. Component tags override this map.
    - `compute_provider`: Typed compute-provider blocks. Exactly one block must be non-null, and the populated block selects the provider. Its presence must be known during planning; values inside it may remain unknown until apply.
    - `compute_provider.ec2`: EC2-specific configuration.
    - `compute_provider.ec2.ami.filter`: EC2 AMI filters combined with the default AMI-name filter.
    - `compute_provider.ec2.ami.owners`: AWS account IDs or aliases allowed to own the selected AMI.
    - `compute_provider.ec2.ami.id_ssm_parameter`: Optional externally managed SSM parameter containing the AMI ID. The wrapper's presence selects external ownership at plan time.
    - `compute_provider.ec2.ami.id_ssm_parameter.arn`: ARN of the externally managed SSM parameter. The ARN may be unknown until apply.
    - `compute_provider.ec2.ami.kms_key`: Optional KMS key required to launch encrypted AMIs or snapshots. The wrapper's presence selects the KMS policy at plan time.
    - `compute_provider.ec2.ami.kms_key.arn`: ARN of the KMS key. The ARN may be unknown until apply.
    - `compute_provider.ec2.block_device_mappings`: EBS mappings added to the runner launch template.
    - `compute_provider.ec2.block_device_mappings[].delete_on_termination`: Deletes the volume when its runner instance terminates.
    - `compute_provider.ec2.block_device_mappings[].device_name`: Device name exposed to the runner instance.
    - `compute_provider.ec2.block_device_mappings[].encrypted`: Enables EBS encryption.
    - `compute_provider.ec2.block_device_mappings[].iops`: Provisioned IOPS for supported volume types.
    - `compute_provider.ec2.block_device_mappings[].kms_key_id`: KMS key ID or ARN used to encrypt the volume.
    - `compute_provider.ec2.block_device_mappings[].snapshot_id`: Snapshot used to initialize the volume.
    - `compute_provider.ec2.block_device_mappings[].throughput`: Provisioned throughput for supported volume types.
    - `compute_provider.ec2.block_device_mappings[].volume_initialization_rate`: Fixed initialization rate in MiB/s for supported snapshot-backed volumes.
    - `compute_provider.ec2.block_device_mappings[].volume_size`: Volume size in GiB.
    - `compute_provider.ec2.block_device_mappings[].volume_type`: EBS volume type.
    - `compute_provider.ec2.create_service_linked_role_spot`: Allows scale-up to create the EC2 Spot service-linked role.
    - `compute_provider.ec2.credit_specification`: CPU credit mode for burstable instance types.
    - `compute_provider.ec2.ebs_optimized`: Requests EBS-optimized runner instances.
    - `compute_provider.ec2.cloudwatch_agent.enabled`: Installs and configures the CloudWatch agent through the default bootstrap flow.
    - `compute_provider.ec2.cloudwatch_agent.config`: Optional complete CloudWatch agent configuration.
    - `compute_provider.ec2.binaries_syncer.enabled`: Enables use of the module-level synchronized runner distribution from S3.
    - `compute_provider.ec2.detailed_monitoring_enabled`: Enables detailed EC2 monitoring for runner instances.
    - `compute_provider.ec2.ssm_enabled`: Attaches runner permissions and policies required for AWS Systems Manager access.
    - `compute_provider.ec2.user_data.enabled`: Enables launch-template user data.
    - `compute_provider.ec2.user_data.template`: Optional path to a custom user-data template.
    - `compute_provider.ec2.user_data.content`: Optional complete user-data content used instead of rendering a template.
    - `compute_provider.ec2.user_data.pre_install`: Script content inserted before runner installation in the default template.
    - `compute_provider.ec2.user_data.post_install`: Script content inserted after runner installation in the default template.
    - `compute_provider.ec2.user_data.debug_logging_enabled`: Enables verbose user-data tracing, which can expose secrets in logs.
    - `compute_provider.ec2.instance_allocation_strategy`: EC2 Fleet allocation strategy used to select capacity.
    - `compute_provider.ec2.instance_max_spot_price`: Optional maximum hourly Spot price.
    - `compute_provider.ec2.instance_target_capacity_type`: Primary capacity type, either `spot` or `on-demand`.
    - `compute_provider.ec2.instance_type_priorities`: Optional numeric priorities keyed by instance type.
    - `compute_provider.ec2.instance_types`: EC2 instance types available to the scale-up and pool functions.
    - `compute_provider.ec2.additional_security_group_ids`: Existing security groups attached to runner instances.
    - `compute_provider.ec2.instance_profile.name`: Name of an externally managed instance profile. Setting it also requires `runner.iam.role`.
    - `compute_provider.ec2.enable_on_demand_failover_for_errors`: EC2 error codes that trigger an on-demand fallback after a Spot launch failure.
    - `compute_provider.ec2.scale_errors`: EC2 error codes treated as retryable scale-up failures.
    - `compute_provider.ec2.subnet_ids`: Subnets from which scale-up may launch runners. Null uses the module-level value.
    - `compute_provider.ec2.vpc_id`: VPC in which runner networking resources are created. Null uses the module-level value.
    - `compute_provider.ec2.cpu_options.core_count`: Number of CPU cores exposed to the runner instance.
    - `compute_provider.ec2.cpu_options.threads_per_core`: Number of hardware threads exposed per CPU core.
    - `compute_provider.ec2.cpu_options.amd_sev_snp`: Enables or disables AMD SEV-SNP on supported instance types.
    - `compute_provider.ec2.cpu_options.nested_virtualization`: Enables or disables nested virtualization on supported instance types.
    - `compute_provider.ec2.placement.affinity`: Host affinity setting.
    - `compute_provider.ec2.placement.availability_zone`: Availability Zone in which the instance is placed.
    - `compute_provider.ec2.placement.group_id`: Placement-group ID.
    - `compute_provider.ec2.placement.group_name`: Placement-group name.
    - `compute_provider.ec2.placement.host_id`: Dedicated Host ID.
    - `compute_provider.ec2.placement.host_resource_group_arn`: ARN of the host resource group used for placement.
    - `compute_provider.ec2.placement.spread_domain`: Spread-domain placement value.
    - `compute_provider.ec2.placement.tenancy`: Instance tenancy.
    - `compute_provider.ec2.placement.partition_number`: Placement-group partition number.
    - `compute_provider.ec2.license_specifications[].license_configuration_arn`: ARN of a License Manager license configuration.
    - `compute_provider.ec2.use_dedicated_host`: Enables the dedicated-host launch path required for macOS runners.
    - `compute_provider.ec2.log_files`: Optional log files collected by the CloudWatch agent.
    - `compute_provider.ec2.log_files[].log_group_name`: CloudWatch log-group name before optional prefixing.
    - `compute_provider.ec2.log_files[].prefix_log_group`: Prefixes the log-group name with the runner stack path when true.
    - `compute_provider.ec2.log_files[].file_path`: File or glob read by the CloudWatch agent.
    - `compute_provider.ec2.log_files[].log_stream_name`: CloudWatch log-stream name template.
    - `compute_provider.ec2.log_files[].log_class`: CloudWatch log-group class for the collected file.
    - `compute_provider.ec2.tags`: Tags for runtime EC2 instances, volumes, network interfaces, and eligible Spot requests. These override entry-level tags and the generated runner `Name`; provider-required bootstrap tags take final precedence.
    - `compute_provider.ec2.metadata_options.instance_metadata_tags`: Exposes instance tags through Instance Metadata Service when enabled.
    - `compute_provider.ec2.metadata_options.http_endpoint`: Enables or disables the Instance Metadata Service endpoint.
    - `compute_provider.ec2.metadata_options.http_tokens`: Controls whether IMDSv2 session tokens are optional or required.
    - `compute_provider.ec2.metadata_options.http_put_response_hop_limit`: Network hop limit for Instance Metadata Service token responses.
    - `compute_provider.microvm`: Lambda MicroVM-specific configuration.
    - `compute_provider.microvm.image_identifier`: ARN or ID of the MicroVM image used to run GitHub runners.
    - `compute_provider.microvm.image_version`: Optional MicroVM image version.
    - `compute_provider.microvm.execution_role.arn`: Optional externally managed execution role assumed by MicroVMs. Null uses the common runner role.
    - `compute_provider.microvm.runner_role_trust_services`: Service principals trusted by the common runner role when it is used as the MicroVM execution role.
    - `compute_provider.microvm.egress_network_connectors`: Egress network connectors passed to RunMicrovm.
    - `compute_provider.microvm.idle_policy`: Optional auto-suspend and auto-resume configuration passed to RunMicrovm.
    - `compute_provider.microvm.logging`: Optional RunMicrovm logging union. Exactly one of `cloud_watch` or `disabled` must be selected when set.
    - `compute_provider.microvm.run_hook_payload`: Optional payload delivered to the MicroVM `/run` hook. Maximum 16,384 characters.
    - `compute_provider.microvm.maximum_duration_in_seconds`: Optional maximum MicroVM lifetime. Valid range is 1 through 28,800 seconds.
    - `compute_provider.microvm.environment_variables`: Additional provider-specific Lambda environment variables merged into scale-up, scale-down, and pool.
    - `compute_provider.microvm.tags`: Tags encoded into the MicroVM runner configuration.
    - `compute_provider.microvm.iam`: Optional MicroVM control-plane IAM overrides and managed policy attachments.
    - `matcherConfig.labelMatchers`: Groups of labels used to match webhook jobs to this configuration.
    - `matcherConfig.exactMatch`: Requires the job labels to exactly match a configured label group.
    - `matcherConfig.bidirectionalLabelMatch`: Requires labels to match in both directions instead of allowing configured subsets.
    - `matcherConfig.priority`: Ordering used when multiple configurations match the same job.
    - `matcherConfig.enableDynamicLabels`: Enables runtime interpretation of supported dynamic AWS labels.
    - `matcherConfig.awsDynamicLabelsPolicy`: Optional policy restricting values accepted from dynamic AWS labels.
  EOT

  type = object({
    multi_runner_config_v2 = optional(map(object({
      tags = optional(map(string), {})

      runner = object({
        os                     = string
        architecture           = string
        boot_time_in_minutes   = optional(number, 5)
        disable_default_labels = optional(bool, false)
        extra_labels           = optional(list(string), [])
        group_name             = optional(string, "Default")
        name_prefix            = optional(string, "")
        run_as_root            = optional(bool, false)
        run_as                 = optional(string, "ec2-user")
        maximum_count          = number
        ephemeral              = optional(bool, false)
        jit_config_enabled     = optional(bool, null)
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
          managed_policy_arns  = optional(map(string), {})
          path                 = optional(string, null)
          permissions_boundary = optional(string, null)
        }), {})
      })

      github = optional(object({
        organization_runners = optional(bool, false)
      }), {})

      lambda = optional(object({
        tags = optional(map(string), {})
      }), {})

      queue = optional(object({
        delay_webhook_event            = optional(number, 30)
        job_queue_retention_in_seconds = optional(number, 86400)
        event_source_mapping = optional(object({
          batch_size                         = optional(number, null)
          maximum_batching_window_in_seconds = optional(number, null)
        }), {})
        redrive_build_queue = optional(object({
          enabled         = bool
          maxReceiveCount = number
          }), {
          enabled         = false
          maxReceiveCount = null
        })
        tags = optional(map(string), {})
      }), {})

      scale_up = optional(object({
        reserved_concurrent_executions = optional(number, 1)
        job_queued_check_enabled       = optional(bool, null)
        tags                           = optional(map(string), {})
      }), {})

      scale_down = optional(object({
        schedule_expression             = optional(string, "cron(*/5 * * * ? *)")
        minimum_running_time_in_minutes = optional(number, null)
        tags                            = optional(map(string), {})
        idle_config = optional(list(object({
          cron             = string
          timeZone         = string
          idleCount        = number
          evictionStrategy = optional(string, "oldest_first")
        })), [])
      }), {})

      pool = optional(object({
        config = optional(list(object({
          schedule_expression          = string
          schedule_expression_timezone = optional(string)
          size                         = number
        })), [])
        runner_owner = optional(string, null)
        tags         = optional(map(string), {})
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

      ssm = optional(object({
        tags = optional(map(string), {})
        kms_key = optional(object({
          arn = string
        }), null)
        parameters = optional(object({
          tags = optional(map(string), {})
        }), {})
        housekeeper = optional(object({
          tags = optional(map(string), {})
        }), {})
      }), {})

      observability = optional(object({
        logs = optional(object({
          tags = optional(map(string), {})
        }), {})
      }), {})

      compute_provider = object({
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
            enabled = optional(bool, true)
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
          instance_allocation_strategy  = optional(string, "lowest-price")
          instance_max_spot_price       = optional(string, null)
          instance_target_capacity_type = optional(string, "spot")
          instance_type_priorities      = optional(map(number), null)
          instance_types                = list(string)
          additional_security_group_ids = optional(list(string), [])
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

        microvm = optional(object({
          image_identifier = string
          image_version    = optional(string, null)
          execution_role = optional(object({
            arn = string
          }), null)
          runner_role_trust_services = optional(list(string), ["lambda.amazonaws.com"])
          egress_network_connectors  = optional(list(string), [])
          idle_policy = optional(object({
            max_idle_duration_seconds  = number
            suspended_duration_seconds = number
            auto_resume_enabled        = bool
          }), null)
          logging = optional(object({
            cloud_watch = optional(object({
              log_group  = optional(string, null)
              log_stream = optional(string, null)
            }), null)
            disabled = optional(bool, false)
          }), null)
          run_hook_payload            = optional(string, null)
          maximum_duration_in_seconds = optional(number, null)
          environment_variables       = optional(map(string), {})
          tags                        = optional(map(string), {})
          iam = optional(object({
            resource_arns = optional(list(string), ["*"])
            actions = optional(object({
              scale_up   = optional(list(string), null)
              scale_down = optional(list(string), null)
            }), {})
            additional_policy_json = optional(object({
              scale_up = optional(string, null)
            }), {})
            managed_policy_arns = optional(object({
              scale_up = optional(string, null)
              pool     = optional(string, null)
            }), {})
          }), {})
        }), null)
      })

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
    })), {})
  })
  default = {}
}
