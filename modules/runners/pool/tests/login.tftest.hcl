mock_provider "aws" {
  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/pool-login-test"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn = "arn:aws:lambda:eu-west-1:123456789012:function:pool-login-test"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

variables {
  config = jsondecode(file("tests/fixtures/pool-config.json"))
}

run "rejects_trailing_hyphen_override" {
  command = plan
  variables {
    config = merge(jsondecode(file("tests/fixtures/pool-config.json")), {
      enable_multi_org_runners = true
      pool                     = [merge(jsondecode(file("tests/fixtures/pool-config.json")).pool[0], { org = "org-" })]
    })
  }
  expect_failures = [var.config]
}

run "rejects_trailing_hyphen_default" {
  command = plan
  variables {
    config = merge(jsondecode(file("tests/fixtures/pool-config.json")), {
      enable_multi_org_runners = true
      runner                   = merge(jsondecode(file("tests/fixtures/pool-config.json")).runner, { pool_owner = "org-" })
    })
  }
  expect_failures = [var.config]
}

run "rejects_repeated_hyphen_override" {
  command = plan
  variables {
    config = merge(jsondecode(file("tests/fixtures/pool-config.json")), {
      enable_multi_org_runners = true
      pool                     = [merge(jsondecode(file("tests/fixtures/pool-config.json")).pool[0], { org = "org--name" })]
    })
  }
  expect_failures = [var.config]
}

run "rejects_repeated_hyphen_default" {
  command = plan
  variables {
    config = merge(jsondecode(file("tests/fixtures/pool-config.json")), {
      enable_multi_org_runners = true
      runner                   = merge(jsondecode(file("tests/fixtures/pool-config.json")).runner, { pool_owner = "org--name" })
    })
  }
  expect_failures = [var.config]
}

run "rejects_leading_hyphen_override" {
  command = plan
  variables {
    config = merge(jsondecode(file("tests/fixtures/pool-config.json")), {
      enable_multi_org_runners = true
      pool                     = [merge(jsondecode(file("tests/fixtures/pool-config.json")).pool[0], { org = "-org" })]
    })
  }
  expect_failures = [var.config]
}

run "rejects_leading_hyphen_default" {
  command = plan
  variables {
    config = merge(jsondecode(file("tests/fixtures/pool-config.json")), {
      enable_multi_org_runners = true
      runner                   = merge(jsondecode(file("tests/fixtures/pool-config.json")).runner, { pool_owner = "-org" })
    })
  }
  expect_failures = [var.config]
}

run "rejects_too_long_override" {
  command = plan
  variables {
    config = merge(jsondecode(file("tests/fixtures/pool-config.json")), {
      enable_multi_org_runners = true
      pool                     = [merge(jsondecode(file("tests/fixtures/pool-config.json")).pool[0], { org = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })]
    })
  }
  expect_failures = [var.config]
}

run "rejects_too_long_default" {
  command = plan
  variables {
    config = merge(jsondecode(file("tests/fixtures/pool-config.json")), {
      enable_multi_org_runners = true
      runner                   = merge(jsondecode(file("tests/fixtures/pool-config.json")).runner, { pool_owner = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })
    })
  }
  expect_failures = [var.config]
}

run "accepts_valid_logins_and_length_boundary" {
  command = plan
  variables {
    config = merge(jsondecode(file("tests/fixtures/pool-config.json")), {
      enable_multi_org_runners = true
      pool                     = [for org in ["a", "Org-1", "org-a-b", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1"] : merge(jsondecode(file("tests/fixtures/pool-config.json")).pool[0], { org = org })]
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
    config = merge(jsondecode(file("tests/fixtures/pool-config.json")), {
      enable_multi_org_runners = false
      runner                   = merge(jsondecode(file("tests/fixtures/pool-config.json")).runner, { pool_owner = "org--name" })
    })
  }
  assert {
    condition     = aws_lambda_function.pool.environment[0].variables["RUNNER_OWNER"] == "org--name"
    error_message = "Stricter validation must remain gated by multi-org mode."
  }
}
