mock_provider "aws" {
  mock_resource "aws_dynamodb_table" {
    defaults = {
      arn = "arn:aws:dynamodb:eu-west-1:123456789012:table/test"
    }
  }
}

variables {
  prefix    = "github-actions"
  entry_ids = ["linux", "microvm"]
  runner_config_access_scope_prefixes = {
    linux   = "arn:aws:ec2:eu-west-1:123456789012:instance/"
    microvm = "arn:aws:ec2:eu-west-1:123456789012:instance/"
  }
  runner_config_ttl_seconds = 3600
  runner_state_ttl_seconds  = 604800
  global_records = {
    github_app_credentials = jsonencode([{ appId = 123456, privateKeyBase64 = "dGVzdA==" }])
    github_webhook_secret  = "test-secret"
    runner_matcher_config  = jsonencode([{ key = "linux" }])
  }
  entry_records = {
    linux = {
      run_as                 = "runner"
      agent_mode             = "ephemeral"
      disable_default_labels = false
      enable_jit_config      = true
    }
    microvm = {
      run_as                 = "root"
      agent_mode             = "ephemeral"
      disable_default_labels = true
      enable_jit_config      = true
    }
  }
  tags = {
    Environment = "test"
    Shared      = "base"
  }
  config = {
    config = {
      kms_key_arn                    = "arn:aws:kms:eu-west-1:123456789012:key/config"
      point_in_time_recovery_enabled = true
      deletion_protection_enabled    = true
      tags = {
        Shared = "config"
      }
    }
    runner_state = {
      kms_key_arn                    = "arn:aws:kms:eu-west-1:123456789012:key/runner-state"
      point_in_time_recovery_enabled = false
      deletion_protection_enabled    = false
      tags = {
        Shared = "runner-state"
      }
    }
  }
}

run "creates_two_shared_scoped_tables" {
  command = apply

  assert {
    condition = (
      aws_dynamodb_table.config.name == "github-actions-config"
      && aws_dynamodb_table.config.billing_mode == "PAY_PER_REQUEST"
      && aws_dynamodb_table.config.hash_key == "scope"
      && aws_dynamodb_table.config.range_key == "id"
      && aws_dynamodb_table.config.point_in_time_recovery[0].enabled
      && aws_dynamodb_table.config.deletion_protection_enabled
      && aws_dynamodb_table.config.server_side_encryption[0].kms_key_arn == "arn:aws:kms:eu-west-1:123456789012:key/config"
      && aws_dynamodb_table.config.tags["Shared"] == "config"
    )
    error_message = "The durable provider table must be one encrypted, scoped, on-demand table for the whole multi-runner deployment."
  }

  assert {
    condition = (
      aws_dynamodb_table.runner_state.name == "github-actions-runner-state"
      && aws_dynamodb_table.runner_state.billing_mode == "PAY_PER_REQUEST"
      && aws_dynamodb_table.runner_state.hash_key == "scope"
      && aws_dynamodb_table.runner_state.range_key == "id"
      && aws_dynamodb_table.runner_state.ttl[0].enabled
      && aws_dynamodb_table.runner_state.ttl[0].attribute_name == "expires_at"
      && !aws_dynamodb_table.runner_state.point_in_time_recovery[0].enabled
      && !aws_dynamodb_table.runner_state.deletion_protection_enabled
      && aws_dynamodb_table.runner_state.server_side_encryption[0].kms_key_arn == "arn:aws:kms:eu-west-1:123456789012:key/runner-state"
      && aws_dynamodb_table.runner_state.tags["Shared"] == "runner-state"
    )
    error_message = "The runner-state provider table must be one encrypted, TTL-backed, scoped, on-demand table for the whole multi-runner deployment."
  }

  assert {
    condition = (
      output.config_table.name == "github-actions-config"
      && output.runner_state_table.name == "github-actions-runner-state"
      && output.runner_state_table.ttl_attribute_name == "expires_at"
    )
    error_message = "The provider outputs must expose the two shared table contracts."
  }

  assert {
    condition = (
      output.capabilities.webhook.direct.environment_variables["RUNNER_CONFIG_STORAGE_PROVIDER"] == "aws_dynamodb"
      && output.capabilities.webhook.direct.environment_variables["RUNNER_CONFIG_DYNAMODB_CONFIG_TABLE_NAME"] == "github-actions-config"
      && output.capabilities.webhook.direct.environment_variables["RUNNER_CONFIG_STORAGE_VERSION"] == terraform_data.config_version.id
      && output.capabilities.webhook.eventbridge.webhook.environment_variables["RUNNER_CONFIG_STORAGE_VERSION"] == terraform_data.config_version.id
      && output.capabilities.webhook.eventbridge.dispatcher.environment_variables["RUNNER_CONFIG_STORAGE_VERSION"] == terraform_data.config_version.id
      && output.capabilities.webhook.direct.environment_variables["RUNNER_MATCHER_CONFIG_VERSION"] == sha256(jsonencode([{ key = "linux" }]))
      && !contains(keys(output.capabilities.webhook.direct.environment_variables), "RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME")
      && !contains(keys(output.capabilities.webhook.direct.environment_variables), "RUNNER_CONFIG_DYNAMODB_TTL_SECONDS")
      && !contains(keys(output.capabilities.webhook.eventbridge.webhook.environment_variables), "RUNNER_MATCHER_CONFIG_VERSION")
      && output.capabilities.webhook.eventbridge.dispatcher.environment_variables["RUNNER_MATCHER_CONFIG_VERSION"] == sha256(jsonencode([{ key = "linux" }]))
      && output.capabilities.entries["linux"].scale_up.environment_variables["RUNNER_CONFIG_DYNAMODB_ENTRY_ID"] == "linux"
      && output.capabilities.entries["linux"].scale_up.environment_variables["RUNNER_CONFIG_STORAGE_VERSION"] == terraform_data.config_version.id
      && !contains(keys(output.capabilities.entries["linux"].scale_up.environment_variables), "RUNNER_MATCHER_CONFIG_VERSION")
      && output.capabilities.entries["microvm"].scale_down.environment_variables["RUNNER_CONFIG_DYNAMODB_ENTRY_ID"] == "microvm"
      && output.capabilities.entries["microvm"].scale_down.environment_variables["RUNNER_CONFIG_STORAGE_VERSION"] == terraform_data.config_version.id
      && output.capabilities.entries["linux"].pool.environment_variables["RUNNER_CONFIG_DYNAMODB_TTL_SECONDS"] == "3600"
      && output.capabilities.entries["linux"].scale_down.environment_variables["RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TTL_SECONDS"] == "604800"
      && !contains(keys(output.capabilities.entries["linux"].scale_down.environment_variables), "RUNNER_CONFIG_DYNAMODB_TTL_SECONDS")
      && !contains(keys(output.capabilities.entries["linux"].job_retry.environment_variables), "RUNNER_CONFIG_DYNAMODB_ENTRY_ID")
      && !contains(keys(output.capabilities.entries["linux"].job_retry.environment_variables), "RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME")
      && output.capabilities.entries["linux"].job_retry.environment_variables["RUNNER_CONFIG_STORAGE_VERSION"] == terraform_data.config_version.id
      && output.capabilities.entries["linux"].runner.config_table_name == "github-actions-config"
      && output.capabilities.entries["linux"].runner.runner_state_table_name == "github-actions-runner-state"
      && output.capabilities.entries["linux"].runner.scope == "entry#linux#bootstrap"
    )
    error_message = "The provider must expose one global and entry-scoped Lambda environment contract over the same two tables."
  }

  assert {
    condition = (
      jsondecode(output.capabilities.webhook.direct.iam_policy_json).Statement[0].Condition["ForAllValues:StringEquals"]["dynamodb:LeadingKeys"] == ["global#webhook", "global#matcher"]
      && jsondecode(output.capabilities.webhook.eventbridge.webhook.iam_policy_json).Statement[0].Condition["ForAllValues:StringEquals"]["dynamodb:LeadingKeys"] == ["global#webhook"]
      && jsondecode(output.capabilities.webhook.eventbridge.dispatcher.iam_policy_json).Statement[0].Condition["ForAllValues:StringEquals"]["dynamodb:LeadingKeys"] == ["global#matcher"]
      && jsondecode(output.capabilities.entries["linux"].scale_up.iam_policy_json).Statement[0].Action == ["dynamodb:GetItem"]
      && jsondecode(output.capabilities.entries["linux"].scale_up.iam_policy_json).Statement[0].Condition["ForAllValues:StringEquals"]["dynamodb:LeadingKeys"] == ["global#github-app"]
      && jsondecode(output.capabilities.entries["linux"].scale_up.iam_policy_json).Statement[1].Action == ["dynamodb:GetItem", "dynamodb:PutItem"]
      && jsondecode(output.capabilities.entries["linux"].scale_up.iam_policy_json).Statement[1].Condition["ForAllValues:StringEquals"]["dynamodb:LeadingKeys"] == ["entry#linux#runner-group"]
      && jsondecode(output.capabilities.entries["linux"].scale_up.iam_policy_json).Statement[2].Action == ["dynamodb:PutItem"]
      && jsondecode(output.capabilities.entries["linux"].scale_up.iam_policy_json).Statement[2].Condition["ForAllValues:StringLike"]["dynamodb:LeadingKeys"] == ["arn:aws:ec2:eu-west-1:123456789012:instance/*"]
      && jsondecode(output.capabilities.entries["linux"].scale_up.iam_policy_json).Statement[3].Action == ["dynamodb:PutItem", "dynamodb:Query", "dynamodb:UpdateItem"]
      && jsondecode(output.capabilities.entries["linux"].scale_up.iam_policy_json).Statement[3].Condition["ForAllValues:StringEquals"]["dynamodb:LeadingKeys"] == ["entry#linux#runner-state"]
      && jsondecode(output.capabilities.entries["microvm"].scale_down.iam_policy_json).Statement[1].Action == ["dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:UpdateItem"]
      && jsondecode(output.capabilities.entries["microvm"].scale_down.iam_policy_json).Statement[1].Condition["ForAllValues:StringEquals"]["dynamodb:LeadingKeys"] == ["entry#microvm#runner-state"]
      && !contains(jsondecode(output.capabilities.entries["linux"].pool.iam_policy_json).Statement[3].Action, "dynamodb:DeleteItem")
      && jsondecode(output.capabilities.entries["linux"].runner.iam_policy_json).Statement[0].Condition["ForAllValues:StringEquals"]["dynamodb:LeadingKeys"] == ["entry#linux#bootstrap"]
      && jsondecode(output.capabilities.entries["linux"].runner.iam_policy_json).Statement[1].Condition["ForAllValues:StringEquals"]["dynamodb:LeadingKeys"] == ["$${ec2:SourceInstanceARN}"]
    )
    error_message = "Provider IAM capabilities must restrict global and entry operations with DynamoDB leading-key conditions."
  }


  assert {
    condition = (
      jsondecode(aws_dynamodb_table_item.github_app_credentials.item).scope.S == "global#github-app"
      && jsondecode(aws_dynamodb_table_item.github_webhook_secret.item).scope.S == "global#webhook"
      && jsondecode(aws_dynamodb_table_item.runner_matcher_config.item).scope.S == "global#matcher"
      && jsondecode(aws_dynamodb_table_item.runner_config["linux"].item).scope.S == "entry#linux#bootstrap"
      && jsondecode(aws_dynamodb_table_item.runner_config["linux"].item).id.S == "runner-config"
      && jsondecode(jsondecode(aws_dynamodb_table_item.runner_config["linux"].item).value.S).run_as == "runner"
      && jsondecode(jsondecode(aws_dynamodb_table_item.runner_config["linux"].item).value.S).runner_config_storage.table_name == "github-actions-runner-state"
      && jsondecode(jsondecode(aws_dynamodb_table_item.runner_config["linux"].item).value.S).runner_config_storage.access_scope == "compute-resource"
      && jsondecode(jsondecode(aws_dynamodb_table_item.runner_config["linux"].item).value.S).runner_config_storage.id == "config"
    )
    error_message = "Each entry must receive one durable bootstrap record that points at its scope in the shared runner-state table."
  }
}

run "storage_version_tracks_global_record_changes" {
  command = apply

  variables {
    global_records = {
      github_app_credentials = jsonencode([{ appId = 123456, privateKeyBase64 = "dGVzdA==" }])
      github_webhook_secret  = "rotated-test-secret"
      runner_matcher_config  = jsonencode([{ key = "linux" }])
    }
  }

  assert {
    condition = (
      output.capabilities.webhook.direct.environment_variables["RUNNER_CONFIG_STORAGE_VERSION"] == terraform_data.config_version.id
      && output.capabilities.entries["linux"].job_retry.environment_variables["RUNNER_CONFIG_STORAGE_VERSION"] == terraform_data.config_version.id
    )
    error_message = "A durable global-record update must publish the replacement storage resource ID to every Lambda capability."
  }
}

run "matcher_version_tracks_matcher_content" {
  command = apply

  variables {
    global_records = {
      github_app_credentials = jsonencode([{ appId = 123456, privateKeyBase64 = "dGVzdA==" }])
      github_webhook_secret  = "rotated-test-secret"
      runner_matcher_config  = jsonencode([{ key = "microvm" }])
    }
  }

  assert {
    condition = (
      output.capabilities.webhook.direct.environment_variables["RUNNER_MATCHER_CONFIG_VERSION"] == sha256(jsonencode([{ key = "microvm" }]))
      && output.capabilities.webhook.direct.environment_variables["RUNNER_MATCHER_CONFIG_VERSION"] != sha256(jsonencode([{ key = "linux" }]))
      && output.capabilities.webhook.direct.environment_variables["RUNNER_CONFIG_STORAGE_VERSION"] == terraform_data.config_version.id
    )
    error_message = "The matcher and opaque storage versions must change without exposing the matcher payload whenever the durable matcher record changes."
  }
}

run "storage_version_tracks_entry_record_changes" {
  command = apply

  variables {
    global_records = {
      github_app_credentials = jsonencode([{ appId = 123456, privateKeyBase64 = "dGVzdA==" }])
      github_webhook_secret  = "rotated-test-secret"
      runner_matcher_config  = jsonencode([{ key = "microvm" }])
    }
    entry_records = {
      linux = {
        run_as                 = "root"
        agent_mode             = "ephemeral"
        disable_default_labels = false
        enable_jit_config      = true
      }
      microvm = {
        run_as                 = "root"
        agent_mode             = "ephemeral"
        disable_default_labels = true
        enable_jit_config      = true
      }
    }
  }

  assert {
    condition = (
      output.capabilities.entries["linux"].scale_up.environment_variables["RUNNER_CONFIG_STORAGE_VERSION"] == terraform_data.config_version.id
      && output.capabilities.webhook.eventbridge.webhook.environment_variables["RUNNER_CONFIG_STORAGE_VERSION"] == terraform_data.config_version.id
    )
    error_message = "A durable entry-record update must publish the replacement storage resource ID to every Lambda capability."
  }
}

run "rejects_missing_runner_config_access_scope_prefix" {
  command = plan

  variables {
    runner_config_access_scope_prefixes = {
      linux = "arn:aws:ec2:eu-west-1:123456789012:instance/"
    }
  }

  expect_failures = [terraform_data.config_version]
}

run "rejects_runner_state_ttl_not_greater_than_runner_config_ttl" {
  command = plan

  variables {
    runner_state_ttl_seconds = 3600
  }

  expect_failures = [terraform_data.config_version]
}

run "rejects_missing_entry_record" {
  command = plan

  variables {
    entry_records = {
      linux = {
        run_as                 = "runner"
        agent_mode             = "ephemeral"
        disable_default_labels = false
        enable_jit_config      = true
      }
    }
  }

  expect_failures = [terraform_data.config_version]
}
