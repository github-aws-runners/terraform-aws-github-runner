output "config_table" {
  description = "Shared durable configuration table. Global and runner-entry records are separated by the `scope` partition key."
  value = {
    arn  = aws_dynamodb_table.config.arn
    name = aws_dynamodb_table.config.name
  }
}

output "runner_state_table" {
  description = "Shared TTL-backed table containing ephemeral runner configuration and provider-neutral runner lifecycle records."
  value = {
    arn                = aws_dynamodb_table.runner_state.arn
    name               = aws_dynamodb_table.runner_state.name
    ttl_attribute_name = "expires_at"
  }
}

output "capabilities" {
  description = "Opaque environment and least-privilege IAM additions consumed by the shared webhook and each runner entry's control-plane functions."
  depends_on = [
    aws_dynamodb_table_item.github_app_credentials,
    aws_dynamodb_table_item.github_webhook_secret,
    aws_dynamodb_table_item.runner_matcher_config,
    aws_dynamodb_table_item.runner_config,
    terraform_data.config_version,
  ]
  value = {
    webhook = {
      direct = {
        environment_variables = tomap(local.matcher_environment_variables)
        iam_policy_json       = local.direct_webhook_iam_policy_json
      }
      eventbridge = {
        webhook = {
          environment_variables = tomap(local.config_environment_variables)
          iam_policy_json       = local.eventbridge_webhook_iam_policy_json
        }
        dispatcher = {
          environment_variables = tomap(local.matcher_environment_variables)
          iam_policy_json       = local.dispatcher_iam_policy_json
        }
      }
    }
    entries = {
      for entry_id in var.entry_ids : entry_id => {
        scale_up = {
          environment_variables = tomap(local.scale_up_environment_variables[entry_id])
          iam_policy_json       = local.scale_up_iam_policy_json[entry_id]
        }
        scale_down = {
          environment_variables = tomap(local.scale_down_environment_variables[entry_id])
          iam_policy_json       = local.scale_down_iam_policy_json[entry_id]
        }
        pool = {
          environment_variables = tomap(local.scale_up_environment_variables[entry_id])
          iam_policy_json       = local.pool_iam_policy_json[entry_id]
        }
        job_retry = {
          environment_variables = tomap(local.config_environment_variables)
          iam_policy_json       = local.job_retry_iam_policy_json[entry_id]
        }
        runner = {
          config_table_name       = aws_dynamodb_table.config.name
          runner_state_table_name = aws_dynamodb_table.runner_state.name
          scope                   = local.entry_scopes[entry_id].bootstrap
          iam_policy_json         = local.runner_iam_policy_json[entry_id]
        }
      }
    }
  }
}
