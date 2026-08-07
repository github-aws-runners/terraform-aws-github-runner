mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

run "computed_iam_values_keep_plan_shape_known" {
  command = plan

  module {
    source = "./tests/fixtures/computed-iam-inputs"
  }

  assert {
    condition     = output.external_role_runner_count == 0
    error_message = "A computed external role ARN and profile name must not make role or profile counts unknown."
  }

  assert {
    condition     = output.generated_policy_role_runner_count == 1
    error_message = "A computed managed-policy ARN under a caller-known map key must keep attachment planning stable."
  }
}
