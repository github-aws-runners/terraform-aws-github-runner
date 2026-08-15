resource "terraform_data" "validate_config" {
  lifecycle {
    precondition {
      condition     = trimspace(var.runner_provider.type) != ""
      error_message = "The compute provider type must not be empty."
    }

    precondition {
      condition     = can(jsondecode(var.runner_provider.iam_policy_json))
      error_message = "The compute provider IAM policy must be valid JSON."
    }

    precondition {
      condition     = !var.runner_provider.managed_policy_enabled || var.runner_provider.managed_policy_arn != null
      error_message = "The compute provider managed policy ARN must be set when its attachment is enabled."
    }
  }
}
