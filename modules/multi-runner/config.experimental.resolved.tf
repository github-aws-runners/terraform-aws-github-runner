# Project stable v1 inputs into the experimental schema, resolve every runner
# configuration against the experimental global defaults, and assemble the
# resource-ready configuration consumed by the multi-runner resources.
locals {
  # Reassemble the split experimental inputs into the canonical shape consumed
  # by the translation and precedence logic below.
  experimental = {
    tags                   = var.experimental_global_config.tags
    roles                  = var.experimental_global_config.roles
    runner                 = var.experimental_global_config.runner
    github                 = var.experimental_global_config_github
    lambda                 = var.experimental_global_config_lambda
    orchestration_provider = var.experimental_global_config_orchestration_provider
    ssm                    = var.experimental_global_config_ssm
    observability          = var.experimental_global_config_observability
    compute_provider       = var.experimental_global_config_compute_provider
    multi_runner_config    = var.experimental_multi_runner_config
  }

  stable_to_experimental = {
    tags                   = local.stable_to_experimental_tags
    roles                  = local.stable_to_experimental_roles
    runner                 = local.stable_to_experimental_runner
    github                 = local.stable_to_experimental_github
    lambda                 = local.stable_to_experimental_lambda
    orchestration_provider = local.stable_to_experimental_orchestration_provider
    ssm                    = local.stable_to_experimental_ssm
    observability          = local.stable_to_experimental_observability
    compute_provider       = local.stable_to_experimental_compute_provider
    multi_runner_config    = local.stable_to_experimental_multi_runner_config
  }

  # A non-empty experimental map selects v2 normalization.
  use_v2_config = length(var.experimental_multi_runner_config) > 0

  normalized_config = local.use_v2_config ? local.experimental : local.stable_to_experimental
}

locals {
  # Resolve each lane against the translated global configuration. This stage
  # is used by runner-binary discovery and must not depend on its outputs.
  resolved_config = merge(local.normalized_config, {
    multi_runner_config = {
      for k, v in local.normalized_config.multi_runner_config : k => merge(v, {
        tags = merge(local.normalized_config.tags, v.tags)

        runner = merge(v.runner, {
          os = try(coalesce(
            v.runner.os,
            local.normalized_config.runner.os,
          ), null)
          architecture = try(coalesce(
            v.runner.architecture,
            local.normalized_config.runner.architecture,
          ), null)
          disable_default_labels = coalesce(
            v.runner.disable_default_labels,
            local.normalized_config.runner.disable_default_labels,
          )
          extra_labels = sort(distinct(concat(
            try(flatten(v.orchestration_provider.webhook.matcherConfig.labelMatchers), []),
            coalesce(
              v.runner.extra_labels,
              local.normalized_config.runner.extra_labels,
            ),
          )))
          group_name = coalesce(
            v.runner.group_name,
            local.normalized_config.runner.group_name,
          )
          name_prefix = v.runner.name_prefix != null ? v.runner.name_prefix : local.normalized_config.runner.name_prefix
          run_as_root = coalesce(
            v.runner.run_as_root,
            local.normalized_config.runner.run_as_root,
          )
          run_as = coalesce(
            v.runner.run_as,
            local.normalized_config.runner.run_as,
          )
          auto_update_disabled = coalesce(
            v.runner.auto_update_disabled,
            local.normalized_config.runner.auto_update_disabled,
          )
          tags = merge(local.normalized_config.runner.tags, v.runner.tags)
          hooks = {
            job_started   = v.runner.hooks.job_started != null ? v.runner.hooks.job_started : local.normalized_config.runner.hooks.job_started
            job_completed = v.runner.hooks.job_completed != null ? v.runner.hooks.job_completed : local.normalized_config.runner.hooks.job_completed
          }
          iam = {
            role = try(coalesce(
              v.runner.iam.role,
              local.normalized_config.runner.iam.role,
            ), null)
            managed_policy_arns = try(coalesce(
              v.runner.iam.managed_policy_arns,
              (v.runner.iam.role != null || local.normalized_config.runner.iam.role != null) ? {} : local.normalized_config.runner.iam.managed_policy_arns,
            ), {})
            additional_trust_policy_json = try(coalesce(
              v.runner.iam.additional_trust_policy_json,
              (v.runner.iam.role != null || local.normalized_config.runner.iam.role != null) ? null : local.normalized_config.runner.iam.additional_trust_policy_json,
            ), null)
            path = try(coalesce(
              v.runner.iam.path,
              local.normalized_config.runner.iam.path,
              local.normalized_config.roles.path,
            ), null)
            permissions_boundary = try(coalesce(
              v.runner.iam.permissions_boundary,
              local.normalized_config.runner.iam.permissions_boundary,
              local.normalized_config.roles.permissions_boundary,
            ), null)
          }
        })

        lambda = merge(v.lambda, {
          runtime = coalesce(
            v.lambda.runtime,
            local.normalized_config.lambda.runtime,
          )
          architecture = coalesce(
            v.lambda.architecture,
            local.normalized_config.lambda.architecture,
          )
          subnet_ids = coalesce(
            v.lambda.subnet_ids,
            local.normalized_config.lambda.subnet_ids,
          )
          security_group_ids = coalesce(
            v.lambda.security_group_ids,
            local.normalized_config.lambda.security_group_ids,
          )
          tags = merge(local.normalized_config.lambda.tags, v.lambda.tags)
          role = {
            path = try(coalesce(
              v.lambda.role.path,
              local.normalized_config.lambda.role.path,
              local.normalized_config.roles.path,
            ), null)
            permissions_boundary = try(coalesce(
              v.lambda.role.permissions_boundary,
              local.normalized_config.lambda.role.permissions_boundary,
              local.normalized_config.roles.permissions_boundary,
            ), null)
          }
        })

        orchestration_provider = {
          webhook = v.orchestration_provider.webhook == null ? null : merge(v.orchestration_provider.webhook, {
            runner = {
              boot_time_in_minutes = coalesce(
                v.orchestration_provider.webhook.runner.boot_time_in_minutes,
                local.normalized_config.orchestration_provider.webhook.runner.boot_time_in_minutes,
              )
              ephemeral = coalesce(
                v.orchestration_provider.webhook.runner.ephemeral,
                local.normalized_config.orchestration_provider.webhook.runner.ephemeral,
              )
              jit_config_enabled = try(coalesce(
                v.orchestration_provider.webhook.runner.jit_config_enabled,
                local.normalized_config.orchestration_provider.webhook.runner.jit_config_enabled,
              ), null)
              maximum_count = try(coalesce(
                v.orchestration_provider.webhook.runner.maximum_count,
                local.normalized_config.orchestration_provider.webhook.runner.maximum_count,
              ), null)
            }

            lambda = merge(v.orchestration_provider.webhook.lambda, {
              scale = merge(v.orchestration_provider.webhook.lambda.scale, {
                up = merge(v.orchestration_provider.webhook.lambda.scale.up, {
                  memory_size = coalesce(
                    v.orchestration_provider.webhook.lambda.scale.up.memory_size,
                    local.normalized_config.orchestration_provider.webhook.lambda.scale.up.memory_size,
                  )
                  timeout = coalesce(
                    v.orchestration_provider.webhook.lambda.scale.up.timeout,
                    local.normalized_config.orchestration_provider.webhook.lambda.scale.up.timeout,
                  )
                  reserved_concurrent_executions = coalesce(
                    v.orchestration_provider.webhook.lambda.scale.up.reserved_concurrent_executions,
                    local.normalized_config.orchestration_provider.webhook.lambda.scale.up.reserved_concurrent_executions,
                  )
                  job_queued_check_enabled = try(coalesce(
                    v.orchestration_provider.webhook.lambda.scale.up.job_queued_check_enabled,
                    local.normalized_config.orchestration_provider.webhook.lambda.scale.up.job_queued_check_enabled,
                  ), null)
                  event_source_mapping = {
                    batch_size = coalesce(
                      v.orchestration_provider.webhook.lambda.scale.up.event_source_mapping.batch_size,
                      local.normalized_config.orchestration_provider.webhook.lambda.scale.up.event_source_mapping.batch_size,
                    )
                    maximum_batching_window_in_seconds = coalesce(
                      v.orchestration_provider.webhook.lambda.scale.up.event_source_mapping.maximum_batching_window_in_seconds,
                      local.normalized_config.orchestration_provider.webhook.lambda.scale.up.event_source_mapping.maximum_batching_window_in_seconds,
                    )
                  }
                  tags = merge(local.normalized_config.orchestration_provider.webhook.lambda.scale.up.tags, v.orchestration_provider.webhook.lambda.scale.up.tags)
                })
                down = merge(v.orchestration_provider.webhook.lambda.scale.down, {
                  memory_size = coalesce(
                    v.orchestration_provider.webhook.lambda.scale.down.memory_size,
                    local.normalized_config.orchestration_provider.webhook.lambda.scale.down.memory_size,
                  )
                  timeout = coalesce(
                    v.orchestration_provider.webhook.lambda.scale.down.timeout,
                    local.normalized_config.orchestration_provider.webhook.lambda.scale.down.timeout,
                  )
                  schedule_expression = coalesce(
                    v.orchestration_provider.webhook.lambda.scale.down.schedule_expression,
                    local.normalized_config.orchestration_provider.webhook.lambda.scale.down.schedule_expression,
                  )
                  minimum_running_time_in_minutes = try(coalesce(
                    v.orchestration_provider.webhook.lambda.scale.down.minimum_running_time_in_minutes,
                    local.normalized_config.orchestration_provider.webhook.lambda.scale.down.minimum_running_time_in_minutes,
                  ), null)
                  idle_config = coalesce(
                    v.orchestration_provider.webhook.lambda.scale.down.idle_config,
                    local.normalized_config.orchestration_provider.webhook.lambda.scale.down.idle_config,
                  )
                  tags = merge(local.normalized_config.orchestration_provider.webhook.lambda.scale.down.tags, v.orchestration_provider.webhook.lambda.scale.down.tags)
                })
              })
              pool = merge(v.orchestration_provider.webhook.lambda.pool, {
                memory_size = coalesce(
                  v.orchestration_provider.webhook.lambda.pool.memory_size,
                  local.normalized_config.orchestration_provider.webhook.lambda.pool.memory_size,
                )
                timeout = coalesce(
                  v.orchestration_provider.webhook.lambda.pool.timeout,
                  local.normalized_config.orchestration_provider.webhook.lambda.pool.timeout,
                )
                reserved_concurrent_executions = coalesce(
                  v.orchestration_provider.webhook.lambda.pool.reserved_concurrent_executions,
                  local.normalized_config.orchestration_provider.webhook.lambda.pool.reserved_concurrent_executions,
                )
                config = coalesce(
                  v.orchestration_provider.webhook.lambda.pool.config,
                  local.normalized_config.orchestration_provider.webhook.lambda.pool.config,
                )
                include_busy_runners = coalesce(
                  v.orchestration_provider.webhook.lambda.pool.include_busy_runners,
                  local.normalized_config.orchestration_provider.webhook.lambda.pool.include_busy_runners,
                )
                runner_owner = try(coalesce(
                  v.orchestration_provider.webhook.lambda.pool.runner_owner,
                  local.normalized_config.orchestration_provider.webhook.lambda.pool.runner_owner,
                ), null)
                tags = merge(local.normalized_config.orchestration_provider.webhook.lambda.pool.tags, v.orchestration_provider.webhook.lambda.pool.tags)
              })
            })

            queue = merge(v.orchestration_provider.webhook.queue, {
              delay_webhook_event = coalesce(
                v.orchestration_provider.webhook.queue.delay_webhook_event,
                local.normalized_config.orchestration_provider.webhook.queue.delay_webhook_event,
              )
              job_queue_retention_in_seconds = coalesce(
                v.orchestration_provider.webhook.queue.job_queue_retention_in_seconds,
                local.normalized_config.orchestration_provider.webhook.queue.job_queue_retention_in_seconds,
              )
              visibility_timeout_seconds = coalesce(
                v.orchestration_provider.webhook.queue.visibility_timeout_seconds,
                local.normalized_config.orchestration_provider.webhook.queue.visibility_timeout_seconds,
              )
              redrive_build_queue = {
                enabled = coalesce(
                  try(v.orchestration_provider.webhook.queue.redrive_build_queue.enabled, null),
                  local.normalized_config.orchestration_provider.webhook.queue.redrive_build_queue.enabled,
                )
                maxReceiveCount = try(
                  coalesce(
                    try(v.orchestration_provider.webhook.queue.redrive_build_queue.maxReceiveCount, null),
                    local.normalized_config.orchestration_provider.webhook.queue.redrive_build_queue.maxReceiveCount,
                  ),
                  null,
                )
              }
              tags = merge(local.normalized_config.orchestration_provider.webhook.queue.tags, v.orchestration_provider.webhook.queue.tags)
            })
          })
        }

        ssm = merge(v.ssm, {
          paths = {
            root = "${trimsuffix(coalesce(
              v.ssm.paths.root,
              local.normalized_config.ssm.paths.root,
              "/github-action-runners/${var.prefix}",
            ), "/")}/${k}"
            tokens = coalesce(
              v.ssm.paths.tokens,
              local.normalized_config.ssm.paths.tokens,
            )
            config = coalesce(
              v.ssm.paths.config,
              local.normalized_config.ssm.paths.config,
            )
          }
          tags = merge(local.normalized_config.ssm.tags, v.ssm.tags)
          parameters = {
            tags = merge(local.normalized_config.ssm.parameters.tags, v.ssm.parameters.tags)
          }
          housekeeper = {
            schedule_expression = coalesce(
              v.ssm.housekeeper.schedule_expression,
              local.normalized_config.ssm.housekeeper.schedule_expression,
            )
            state = coalesce(
              v.ssm.housekeeper.state,
              local.normalized_config.ssm.housekeeper.state,
            )
            tags = merge(local.normalized_config.ssm.housekeeper.tags, v.ssm.housekeeper.tags)
            lambda = {
              # Artifact precedence: lane ZIP, lane S3, global ZIP, then global
              # S3.
              artifact = v.ssm.housekeeper.lambda.artifact.zip != null ? {
                zip = v.ssm.housekeeper.lambda.artifact.zip
                s3  = null
                } : v.ssm.housekeeper.lambda.artifact.s3 != null ? {
                zip = null
                s3  = v.ssm.housekeeper.lambda.artifact.s3
                } : local.normalized_config.ssm.housekeeper.lambda.artifact.zip != null ? {
                zip = local.normalized_config.ssm.housekeeper.lambda.artifact.zip
                s3  = null
                } : {
                zip = null
                s3  = local.normalized_config.ssm.housekeeper.lambda.artifact.s3
              }
              memory_size = coalesce(
                v.ssm.housekeeper.lambda.memory_size,
                local.normalized_config.ssm.housekeeper.lambda.memory_size,
              )
              timeout = coalesce(
                v.ssm.housekeeper.lambda.timeout,
                local.normalized_config.ssm.housekeeper.lambda.timeout,
              )
            }
            config = {
              tokenPath = try(coalesce(
                v.ssm.housekeeper.config.tokenPath,
                local.normalized_config.ssm.housekeeper.config.tokenPath,
              ), null)
              minimumDaysOld = coalesce(
                v.ssm.housekeeper.config.minimumDaysOld,
                local.normalized_config.ssm.housekeeper.config.minimumDaysOld,
              )
              dryRun = coalesce(
                v.ssm.housekeeper.config.dryRun,
                local.normalized_config.ssm.housekeeper.config.dryRun,
              )
            }
          }
        })

        observability = {
          logs = {
            level = coalesce(
              v.observability.logs.level,
              local.normalized_config.observability.logs.level,
            )
            retention_in_days = coalesce(
              v.observability.logs.retention_in_days,
              local.normalized_config.observability.logs.retention_in_days,
            )
            kms_key_id = try(coalesce(
              v.observability.logs.kms_key_id,
              local.normalized_config.observability.logs.kms_key_id,
            ), null)
            class = coalesce(
              v.observability.logs.class,
              local.normalized_config.observability.logs.class,
            )
            tags = merge(local.normalized_config.observability.logs.tags, v.observability.logs.tags)
          }
          tracing = {
            mode = try(coalesce(
              v.observability.tracing.mode,
              local.normalized_config.observability.tracing.mode,
            ), null)
            capture_http_requests = coalesce(
              v.observability.tracing.capture_http_requests,
              local.normalized_config.observability.tracing.capture_http_requests,
            )
            capture_error = coalesce(
              v.observability.tracing.capture_error,
              local.normalized_config.observability.tracing.capture_error,
            )
          }
          metrics = {
            enabled = coalesce(
              v.observability.metrics.enabled,
              local.normalized_config.observability.metrics.enabled,
            )
            namespace = coalesce(
              v.observability.metrics.namespace,
              local.normalized_config.observability.metrics.namespace,
            )
            metric = {
              github_app_rate_limit_enabled = coalesce(
                v.observability.metrics.metric.github_app_rate_limit_enabled,
                local.normalized_config.observability.metrics.metric.github_app_rate_limit_enabled,
              )
              job_retry_enabled = coalesce(
                v.observability.metrics.metric.job_retry_enabled,
                local.normalized_config.observability.metrics.metric.job_retry_enabled,
              )
              spot_termination_enabled = coalesce(
                v.observability.metrics.metric.spot_termination_enabled,
                local.normalized_config.observability.metrics.metric.spot_termination_enabled,
              )
              spot_termination_warning_enabled = coalesce(
                v.observability.metrics.metric.spot_termination_warning_enabled,
                local.normalized_config.observability.metrics.metric.spot_termination_warning_enabled,
              )
            }
          }
        }

        compute_provider = {
          aws = {
            ec2 = v.compute_provider.aws.ec2 == null ? null : merge(v.compute_provider.aws.ec2, {
              vpc_id = try(coalesce(
                v.compute_provider.aws.ec2.vpc_id,
                local.normalized_config.compute_provider.aws.ec2.vpc_id,
              ), null)
              subnet_ids = try(coalesce(
                v.compute_provider.aws.ec2.subnet_ids,
                local.normalized_config.compute_provider.aws.ec2.subnet_ids,
              ), null)
              managed_security_group_enabled = coalesce(
                v.compute_provider.aws.ec2.managed_security_group_enabled,
                local.normalized_config.compute_provider.aws.ec2.managed_security_group_enabled,
              )
              egress_rules = coalesce(
                v.compute_provider.aws.ec2.egress_rules,
                local.normalized_config.compute_provider.aws.ec2.egress_rules,
              )
              additional_security_group_ids = coalesce(
                v.compute_provider.aws.ec2.additional_security_group_ids,
                local.normalized_config.compute_provider.aws.ec2.additional_security_group_ids,
              )
              instance_profile_path = try(coalesce(
                v.compute_provider.aws.ec2.instance_profile_path,
                local.normalized_config.compute_provider.aws.ec2.instance_profile_path,
              ), null)
              key_name = try(coalesce(
                v.compute_provider.aws.ec2.key_name,
                local.normalized_config.compute_provider.aws.ec2.key_name,
              ), null)
              associate_public_ipv4_address = coalesce(
                v.compute_provider.aws.ec2.associate_public_ipv4_address,
                local.normalized_config.compute_provider.aws.ec2.associate_public_ipv4_address,
              )
              cloudwatch_agent = merge(v.compute_provider.aws.ec2.cloudwatch_agent, {
                config = try(coalesce(
                  v.compute_provider.aws.ec2.cloudwatch_agent.config,
                  local.normalized_config.compute_provider.aws.ec2.cloudwatch_agent.config,
                ), null)
              })
              binaries_syncer = {
                enabled = coalesce(
                  v.compute_provider.aws.ec2.binaries_syncer.enabled,
                  local.normalized_config.compute_provider.aws.ec2.runner_binaries.enabled,
                )
              }
              tags = merge(local.normalized_config.compute_provider.aws.ec2.tags, v.compute_provider.aws.ec2.tags)
            })
          }
        }
      })
    }
  })
}
