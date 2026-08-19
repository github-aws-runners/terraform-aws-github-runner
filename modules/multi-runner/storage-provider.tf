locals {
  requested_storage_provider_types = compact([
    try(var.experimental.storage_provider.aws.dynamodb, null) != null ? "aws_dynamodb" : "",
    try(var.experimental.storage_provider.aws.ssm, null) != null ? "aws_ssm" : "",
  ])

  storage_provider_type = local.use_multi_runner_config_v2 ? (
    length(local.requested_storage_provider_types) == 0
    ? "aws_ssm"
    : one(local.requested_storage_provider_types)
  ) : "aws_ssm"

  default_dynamodb_storage_provider = {
    config = {
      kms_key_arn                    = null
      point_in_time_recovery_enabled = true
      deletion_protection_enabled    = false
      tags                           = {}
    }
    runner_state = {
      kms_key_arn                    = null
      point_in_time_recovery_enabled = false
      deletion_protection_enabled    = false
      runner_config_ttl_seconds      = 86400
      runner_state_ttl_seconds       = 604800
      tags                           = {}
    }
  }

  dynamodb_storage_provider = coalesce(
    try(var.experimental.storage_provider.aws.dynamodb, null),
    local.default_dynamodb_storage_provider,
  )

  storage_runner_matcher_config_by_key = {
    for k, v in local.runner_matcher_config : format("%03d-%s", v.matcherConfig.priority, k) => merge(v, {
      key             = k
      computeProvider = lower(trimspace(v.computeProvider))
    })
  }
  storage_runner_matcher_config = [
    for k in sort(keys(local.storage_runner_matcher_config_by_key)) : local.storage_runner_matcher_config_by_key[k]
  ]

  dynamodb_global_records = local.storage_provider_type == "aws_dynamodb" ? {
    github_app_credentials = sensitive(jsonencode(concat(
      [{
        appId            = try(tonumber(local.translated_experimental.github.app.id), 0)
        privateKeyBase64 = local.translated_experimental.github.app.key_base64
      }],
      [for app in local.translated_experimental.github.additional_apps : merge(
        {
          appId            = try(tonumber(app.id), 0)
          privateKeyBase64 = app.key_base64
        },
        app.installation_id == null ? {} : {
          installationId = try(tonumber(app.installation_id), 0)
        },
      )],
    )))
    github_webhook_secret = sensitive(local.translated_experimental.github.app.webhook_secret)
    runner_matcher_config = jsonencode(local.storage_runner_matcher_config)
    } : {
    github_app_credentials = sensitive("")
    github_webhook_secret  = sensitive("")
    runner_matcher_config  = ""
  }

  dynamodb_entry_records = {
    for entry_id, entry in local.translated_experimental.multi_runner_config : entry_id => {
      run_as                 = entry.runner.run_as_root ? "root" : entry.runner.run_as
      agent_mode             = entry.orchestration_provider.webhook.runner.ephemeral ? "ephemeral" : "persistent"
      disable_default_labels = entry.runner.disable_default_labels
      enable_jit_config      = entry.orchestration_provider.webhook.runner.jit_config_enabled
    }
    if local.storage_provider_type == "aws_dynamodb"
  }
}

data "aws_caller_identity" "storage" {
  count = local.storage_provider_type == "aws_dynamodb" ? 1 : 0
}

module "storage_aws_dynamodb" {
  source = "../storage-providers/aws/dynamodb"
  count  = local.storage_provider_type == "aws_dynamodb" ? 1 : 0

  prefix = var.prefix
  tags = merge(
    local.translated_experimental.tags,
    { "ghr:environment" = var.prefix },
  )
  config = {
    config = local.dynamodb_storage_provider.config
    runner_state = {
      kms_key_arn                    = local.dynamodb_storage_provider.runner_state.kms_key_arn
      point_in_time_recovery_enabled = local.dynamodb_storage_provider.runner_state.point_in_time_recovery_enabled
      deletion_protection_enabled    = local.dynamodb_storage_provider.runner_state.deletion_protection_enabled
      tags                           = local.dynamodb_storage_provider.runner_state.tags
    }
  }
  entry_ids = keys(local.translated_experimental.multi_runner_config)
  runner_config_access_scope_prefixes = {
    for entry_id in keys(local.translated_experimental.multi_runner_config) :
    entry_id => "arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.storage[0].account_id}:instance/"
  }
  runner_config_ttl_seconds = local.dynamodb_storage_provider.runner_state.runner_config_ttl_seconds
  runner_state_ttl_seconds  = local.dynamodb_storage_provider.runner_state.runner_state_ttl_seconds
  global_records            = local.dynamodb_global_records
  entry_records             = local.dynamodb_entry_records
}

locals {
  dynamodb_storage_capabilities = one(module.storage_aws_dynamodb[*].capabilities)

  storage_provider_capabilities = local.storage_provider_type == "aws_dynamodb" ? local.dynamodb_storage_capabilities : {
    webhook = {
      direct = {
        environment_variables = tomap({})
        iam_policy_json       = null
      }
      eventbridge = {
        webhook = {
          environment_variables = tomap({})
          iam_policy_json       = null
        }
        dispatcher = {
          environment_variables = tomap({})
          iam_policy_json       = null
        }
      }
    }
    entries = {
      for entry_id in keys(local.translated_experimental.multi_runner_config) : entry_id => {
        scale_up = {
          environment_variables = tomap({})
          iam_policy_json       = null
        }
        scale_down = {
          environment_variables = tomap({})
          iam_policy_json       = null
        }
        pool = {
          environment_variables = tomap({})
          iam_policy_json       = null
        }
        job_retry = {
          environment_variables = tomap({})
          iam_policy_json       = null
        }
        runner = {
          config_table_name       = null
          runner_state_table_name = null
          scope                   = null
          iam_policy_json         = null
        }
      }
    }
  }
}
