locals {
  config_environment_variables = {
    RUNNER_CONFIG_STORAGE_PROVIDER           = "aws_dynamodb"
    RUNNER_CONFIG_STORAGE_VERSION            = terraform_data.config_version.id
    RUNNER_CONFIG_DYNAMODB_CONFIG_TABLE_NAME = aws_dynamodb_table.config.name
  }

  matcher_environment_variables = merge(local.config_environment_variables, {
    RUNNER_MATCHER_CONFIG_VERSION = nonsensitive(sha256(var.global_records.runner_matcher_config))
  })

  runner_state_environment_variables = {
    RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME  = aws_dynamodb_table.runner_state.name
    RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TTL_SECONDS = tostring(var.runner_state_ttl_seconds)
  }

  runner_config_environment_variables = {
    RUNNER_CONFIG_DYNAMODB_TTL_SECONDS = tostring(var.runner_config_ttl_seconds)
  }

  global_scopes = {
    github_app = "global#github-app"
    webhook    = "global#webhook"
    matcher    = "global#matcher"
  }

  entry_scopes = {
    for entry_id in var.entry_ids : entry_id => {
      bootstrap    = "entry#${entry_id}#bootstrap"
      runner_group = "entry#${entry_id}#runner-group"
      runner_state = "entry#${entry_id}#runner-state"
    }
  }

  entry_environment_variables = {
    for entry_id, scopes in local.entry_scopes : entry_id => merge(local.config_environment_variables, {
      RUNNER_CONFIG_DYNAMODB_ENTRY_ID = entry_id
    })
  }

  scale_up_environment_variables = {
    for entry_id in var.entry_ids : entry_id => merge(
      local.entry_environment_variables[entry_id],
      local.runner_state_environment_variables,
      local.runner_config_environment_variables,
    )
  }

  scale_down_environment_variables = {
    for entry_id in var.entry_ids : entry_id => merge(
      local.entry_environment_variables[entry_id],
      local.runner_state_environment_variables,
    )
  }

  github_app_read_statement = {
    Effect   = "Allow"
    Action   = ["dynamodb:GetItem"]
    Resource = [aws_dynamodb_table.config.arn]
    Condition = {
      "ForAllValues:StringEquals" = {
        "dynamodb:LeadingKeys" = [local.global_scopes.github_app]
      }
    }
  }

  direct_webhook_read_statement = {
    Effect   = "Allow"
    Action   = ["dynamodb:GetItem"]
    Resource = [aws_dynamodb_table.config.arn]
    Condition = {
      "ForAllValues:StringEquals" = {
        "dynamodb:LeadingKeys" = [local.global_scopes.webhook, local.global_scopes.matcher]
      }
    }
  }

  eventbridge_webhook_read_statement = {
    Effect   = "Allow"
    Action   = ["dynamodb:GetItem"]
    Resource = [aws_dynamodb_table.config.arn]
    Condition = {
      "ForAllValues:StringEquals" = {
        "dynamodb:LeadingKeys" = [local.global_scopes.webhook]
      }
    }
  }

  dispatcher_read_statement = {
    Effect   = "Allow"
    Action   = ["dynamodb:GetItem"]
    Resource = [aws_dynamodb_table.config.arn]
    Condition = {
      "ForAllValues:StringEquals" = {
        "dynamodb:LeadingKeys" = [local.global_scopes.matcher]
      }
    }
  }

  direct_webhook_iam_policy_json = jsonencode({
    Version   = "2012-10-17"
    Statement = [local.direct_webhook_read_statement]
  })

  eventbridge_webhook_iam_policy_json = jsonencode({
    Version   = "2012-10-17"
    Statement = [local.eventbridge_webhook_read_statement]
  })

  dispatcher_iam_policy_json = jsonencode({
    Version   = "2012-10-17"
    Statement = [local.dispatcher_read_statement]
  })

  entry_runner_group_statements = {
    for entry_id, scopes in local.entry_scopes : entry_id => {
      Effect   = "Allow"
      Action   = ["dynamodb:GetItem", "dynamodb:PutItem"]
      Resource = [aws_dynamodb_table.config.arn]
      Condition = {
        "ForAllValues:StringEquals" = {
          "dynamodb:LeadingKeys" = [scopes.runner_group]
        }
      }
    }
  }

  runner_config_write_statements = {
    for entry_id, scopes in local.entry_scopes : entry_id => {
      Effect   = "Allow"
      Action   = ["dynamodb:PutItem"]
      Resource = [aws_dynamodb_table.runner_state.arn]
      Condition = {
        "ForAllValues:StringLike" = {
          "dynamodb:LeadingKeys" = ["${var.runner_config_access_scope_prefixes[entry_id]}*"]
        }
      }
    }
  }

  runner_state_write_statements = {
    for entry_id, scopes in local.entry_scopes : entry_id => {
      Effect = "Allow"
      Action = [
        "dynamodb:PutItem",
        "dynamodb:Query",
        "dynamodb:UpdateItem",
      ]
      Resource = [aws_dynamodb_table.runner_state.arn]
      Condition = {
        "ForAllValues:StringEquals" = {
          "dynamodb:LeadingKeys" = [scopes.runner_state]
        }
      }
    }
  }

  runner_state_reconcile_statements = {
    for entry_id, scopes in local.entry_scopes : entry_id => {
      Effect = "Allow"
      Action = [
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:UpdateItem",
      ]
      Resource = [aws_dynamodb_table.runner_state.arn]
      Condition = {
        "ForAllValues:StringEquals" = {
          "dynamodb:LeadingKeys" = [scopes.runner_state]
        }
      }
    }
  }

  scale_up_iam_policy_json = {
    for entry_id in var.entry_ids : entry_id => jsonencode({
      Version = "2012-10-17"
      Statement = [
        local.github_app_read_statement,
        local.entry_runner_group_statements[entry_id],
        local.runner_config_write_statements[entry_id],
        local.runner_state_write_statements[entry_id],
      ]
    })
  }

  scale_down_iam_policy_json = {
    for entry_id in var.entry_ids : entry_id => jsonencode({
      Version   = "2012-10-17"
      Statement = [local.github_app_read_statement, local.runner_state_reconcile_statements[entry_id]]
    })
  }

  pool_iam_policy_json = {
    for entry_id in var.entry_ids : entry_id => jsonencode({
      Version = "2012-10-17"
      Statement = [
        local.github_app_read_statement,
        local.entry_runner_group_statements[entry_id],
        local.runner_config_write_statements[entry_id],
        local.runner_state_write_statements[entry_id],
      ]
    })
  }

  job_retry_iam_policy_json = {
    for entry_id in var.entry_ids : entry_id => jsonencode({
      Version   = "2012-10-17"
      Statement = [local.github_app_read_statement]
    })
  }

  runner_iam_policy_json = {
    for entry_id, scopes in local.entry_scopes : entry_id => jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Effect   = "Allow"
          Action   = ["dynamodb:GetItem"]
          Resource = [aws_dynamodb_table.config.arn]
          Condition = {
            "ForAllValues:StringEquals" = {
              "dynamodb:LeadingKeys" = [scopes.bootstrap]
            }
          }
        },
        {
          Effect = "Allow"
          Action = [
            "dynamodb:DeleteItem",
            "dynamodb:GetItem",
          ]
          Resource = [aws_dynamodb_table.runner_state.arn]
          Condition = {
            "ForAllValues:StringEquals" = {
              "dynamodb:LeadingKeys" = ["$${ec2:SourceInstanceARN}"]
            }
          }
        },
      ]
    })
  }
}
