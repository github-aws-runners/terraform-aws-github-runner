resource "terraform_data" "validate_config" {
  lifecycle {
    precondition {
      condition     = trimspace(var.config.image_identifier) != ""
      error_message = "compute_provider.microvm.image_identifier must not be empty."
    }

    precondition {
      condition = var.config.maximum_duration_in_seconds == null ? true : (
        var.config.maximum_duration_in_seconds >= 1 &&
        var.config.maximum_duration_in_seconds <= 28800
      )
      error_message = "compute_provider.microvm.maximum_duration_in_seconds must be null or between 1 and 28800."
    }

    precondition {
      condition     = var.config.run_hook_payload == null ? true : length(var.config.run_hook_payload) <= 16384
      error_message = "compute_provider.microvm.run_hook_payload must be 16384 characters or less."
    }

    precondition {
      condition = var.config.logging == null ? true : (
        (var.config.logging.cloud_watch == null ? 0 : 1) +
        (var.config.logging.disabled ? 1 : 0) == 1
      )
      error_message = "compute_provider.microvm.logging must set exactly one of cloud_watch or disabled."
    }

    precondition {
      condition     = try(var.config.iam.additional_policy_json.scale_up, null) == null ? true : can(jsondecode(var.config.iam.additional_policy_json.scale_up))
      error_message = "compute_provider.microvm.iam.additional_policy_json.scale_up must be valid JSON when set."
    }
  }
}
