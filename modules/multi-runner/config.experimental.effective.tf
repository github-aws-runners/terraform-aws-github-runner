# Assemble the resource-ready configuration after runner-binary discovery.
locals {
  effective_config = merge(local.resolved_config, {
    multi_runner_config = {
      for k, v in local.resolved_config.multi_runner_config : k => merge(v, {
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
          enterprise_server = local.normalized_config.github.enterprise_server
          user_agent        = local.normalized_config.github.user_agent
        }

        lambda = merge(v.lambda, {
          artifact   = local.normalized_config.lambda.artifact
          principals = local.normalized_config.lambda.principals
        })

        orchestration_provider = {
          webhook = v.orchestration_provider.webhook == null ? null : merge(v.orchestration_provider.webhook, {
            queue = merge(v.orchestration_provider.webhook.queue, {
              kms_key_id = local.normalized_config.orchestration_provider.webhook.queue.encryption.kms_master_key_id
            })

            lambda = merge(v.orchestration_provider.webhook.lambda, {
              artifact = local.normalized_config.orchestration_provider.webhook.lambda.artifact
            })
          })
        }

        ssm = merge(v.ssm, {
          kms_key_id = local.normalized_config.ssm.kms_key_id
        })

        compute_provider = merge(v.compute_provider, {
          aws = merge(v.compute_provider.aws, {
            ec2 = v.compute_provider.aws.ec2 == null ? null : merge(v.compute_provider.aws.ec2, {
              binaries_syncer = merge(v.compute_provider.aws.ec2.binaries_syncer, {
                s3 = v.compute_provider.aws.ec2.binaries_syncer.enabled ? try(
                  local.runner_binaries_by_os_and_arch_map["${v.runner.os}_${v.runner.architecture}"],
                  null,
                ) : null
              })
            })
          })
        })
      })
    }
  })
}
