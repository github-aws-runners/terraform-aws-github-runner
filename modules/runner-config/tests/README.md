# Terraform Tests

This directory contains [Terraform test files](https://developer.hashicorp.com/terraform/language/tests) (`.tftest.hcl`) for the runners module.

## Why `terraform test` instead of `terraform validate`?

`terraform validate` only checks syntax and basic type correctness of the configuration. It **cannot** detect:

- Conditional expressions with inconsistent result types (e.g., one branch returns an object with 1 attribute, the other returns 16)
- Runtime type mismatches that only surface during `plan`
- Invalid cross-module references that depend on resource attribute shapes

`terraform test` with `mock_provider` runs a full plan without needing real cloud credentials, catching these classes of bugs in CI.

## Requirements

- Terraform >= 1.7 (for `mock_provider` and `mock_data` support)
- No AWS credentials required — all providers are mocked

## Running locally

```bash
cd modules/runners
terraform test -test-directory=tests
```

Expected output:

```
tests/pool.tftest.hcl... in progress
  run "plan_with_pool_enabled"... pass
tests/pool.tftest.hcl... pass

Success! 1 passed, 0 failed.
```

## Writing new tests

1. Create a `.tftest.hcl` file in this directory
2. Use `mock_provider "aws" {}` to avoid needing credentials
3. Use `mock_data` blocks to provide realistic values for data sources that perform validation (e.g., `aws_iam_policy_document` validates JSON)
4. Set all required variables in a `variables {}` block
5. Use `run` blocks with `command = plan` and `assert` conditions

### Example template

```hcl
mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }
}

variables {
  # ... required variables ...
}

run "descriptive_test_name" {
  command = plan

  assert {
    condition     = <expression>
    error_message = "Explanation of what failed"
  }
}
```

## CI integration

These tests run automatically in the `terraform_test` job of `.github/workflows/terraform.yml` on every PR that touches `*.tf` or `*.hcl` files.
