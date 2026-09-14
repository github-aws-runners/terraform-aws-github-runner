mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

variables {
  config = {
    enable_multi_org_runners = true
    prefix                   = "pool-login-test"
    lambda = {
      log_level                      = "info"
      logging_retention_in_days      = 14
      logging_kms_key_id             = null
      log_class                      = "STANDARD"
      reserved_concurrent_executions = 1
      s3_bucket                      = "lambda-artifacts"
      s3_key                         = "runners.zip"
      s3_object_version              = null
      security_group_ids             = []
      runtime                        = "nodejs24.x"
      architecture                   = "arm64"
      memory_size                    = 256
      timeout                        = 60
      zip                            = null
      subnet_ids                     = []
      parameter_store_tags           = "{}"
    }
    tags = {}
    ghes = { url = null, ssl_verify = "true" }
    github_app_parameters = {
      id         = { name = "/test/app-id", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/test/app-id" }
      key_base64 = { name = "/test/app-key", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/test/app-key" }
    }
    subnet_ids = ["subnet-test"]
    runner = {
      disable_runner_autoupdate            = false
      ephemeral                            = true
      enable_jit_config                    = true
      enable_on_demand_failover_for_errors = []
      scale_errors                         = []
      boot_time_in_minutes                 = 5
      labels                               = ["self-hosted"]
      launch_template                      = { name = "test" }
      group_name                           = "Default"
      name_prefix                          = "test"
      pool_owner                           = "default-org"
      role                                 = { arn = "arn:aws:iam::123456789012:role/runner" }
      use_dedicated_host                   = false
    }
    runners_maximum_count                = 10
    instance_types                       = ["m5.large"]
    instance_target_capacity_type        = "spot"
    instance_allocation_strategy         = "lowest-price"
    instance_max_spot_price              = null
    pool                                 = [{ schedule_expression = "cron(0 8 * * ? *)", schedule_expression_timezone = "UTC", size = 1 }]
    include_busy_runners                 = false
    role_permissions_boundary            = null
    kms_key_arn                          = ""
    ami_kms_key_arn                      = ""
    ami_id_ssm_parameter_arn             = "arn:aws:ssm:eu-west-1:123456789012:parameter/test/ami"
    role_path                            = "/"
    ssm_token_path                       = "/test/tokens"
    ssm_config_path                      = "/test/config"
    ami_id_ssm_parameter_name            = null
    ami_id_ssm_parameter_read_policy_arn = null
    arn_ssm_parameters_path_config       = "arn:aws:ssm:eu-west-1:123456789012:parameter/test/config"
    lambda_tags                          = {}
    user_agent                           = "terraform-aws-github-runner"
  }
}

run "rejects_trailing_hyphen_override" {
  command = plan
  variables {
    config = merge(var.config, {
      enable_multi_org_runners = true
      pool                     = [merge(var.config.pool[0], { org = "org-" })]
    })
  }
  expect_failures = [var.config]
}

run "rejects_trailing_hyphen_default" {
  command = plan
  variables {
    config = merge(var.config, {
      enable_multi_org_runners = true
      runner                   = merge(var.config.runner, { pool_owner = "org-" })
    })
  }
  expect_failures = [var.config]
}

run "rejects_repeated_hyphen_override" {
  command = plan
  variables {
    config = merge(var.config, {
      enable_multi_org_runners = true
      pool                     = [merge(var.config.pool[0], { org = "org--name" })]
    })
  }
  expect_failures = [var.config]
}

run "rejects_repeated_hyphen_default" {
  command = plan
  variables {
    config = merge(var.config, {
      enable_multi_org_runners = true
      runner                   = merge(var.config.runner, { pool_owner = "org--name" })
    })
  }
  expect_failures = [var.config]
}

run "rejects_leading_hyphen_override" {
  command = plan
  variables {
    config = merge(var.config, {
      enable_multi_org_runners = true
      pool                     = [merge(var.config.pool[0], { org = "-org" })]
    })
  }
  expect_failures = [var.config]
}

run "rejects_leading_hyphen_default" {
  command = plan
  variables {
    config = merge(var.config, {
      enable_multi_org_runners = true
      runner                   = merge(var.config.runner, { pool_owner = "-org" })
    })
  }
  expect_failures = [var.config]
}

run "rejects_too_long_override" {
  command = plan
  variables {
    config = merge(var.config, {
      enable_multi_org_runners = true
      pool                     = [merge(var.config.pool[0], { org = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })]
    })
  }
  expect_failures = [var.config]
}

run "rejects_too_long_default" {
  command = plan
  variables {
    config = merge(var.config, {
      enable_multi_org_runners = true
      runner                   = merge(var.config.runner, { pool_owner = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })
    })
  }
  expect_failures = [var.config]
}

run "accepts_valid_logins_and_length_boundary" {
  command = plan
  variables {
    config = merge(var.config, {
      enable_multi_org_runners = true
      pool                     = [for org in ["a", "Org-1", "org-a-b", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1"] : merge(var.config.pool[0], { org = org })]
    })
  }
  assert {
    condition     = length(aws_scheduler_schedule.pool) == 5
    error_message = "Valid logins including the 39-character boundary must be accepted."
  }
}

run "preserves_disabled_mode_login_handling" {
  command = plan
  variables {
    config = merge(var.config, {
      enable_multi_org_runners = false
      runner                   = merge(var.config.runner, { pool_owner = "org--name" })
    })
  }
  assert {
    condition     = aws_lambda_function.pool.environment[0].variables["RUNNER_OWNER"] == "org--name"
    error_message = "Stricter validation must remain gated by multi-org mode."
  }
}
