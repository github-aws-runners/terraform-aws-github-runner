resource "terraform_data" "validate_config" {
  lifecycle {
    precondition {
      condition     = can(regex("^arn:[^:]+:lambda:[^:]+:[0-9]{12}:microvm-image:.+$", var.config.image_arn))
      error_message = "compute_provider.aws.microvm.image_arn must be a Lambda MicroVM image ARN."
    }

    precondition {
      condition = var.config.maximum_duration_in_seconds == null ? true : (
        floor(var.config.maximum_duration_in_seconds) == var.config.maximum_duration_in_seconds &&
        var.config.maximum_duration_in_seconds >= 1 &&
        var.config.maximum_duration_in_seconds <= 28800
      )
      error_message = "compute_provider.aws.microvm.maximum_duration_in_seconds must be null or an integer between 1 and 28800."
    }

    precondition {
      condition = (
        length(var.config.ingress_network_connectors) <= 10 &&
        alltrue([
          for connector in var.config.ingress_network_connectors :
          can(regex("^arn:[^:]+:lambda:[^:]+:([0-9]{12}|aws):network-connector:[^[:space:]]+$", connector))
        ])
      )
      error_message = "compute_provider.aws.microvm.ingress_network_connectors must contain at most 10 Lambda network-connector ARNs."
    }

    precondition {
      condition = (
        length(var.config.egress_network_connectors) <= 10 &&
        alltrue([
          for connector in var.config.egress_network_connectors :
          can(regex("^arn:[^:]+:lambda:[^:]+:([0-9]{12}|aws):network-connector:[^[:space:]]+$", connector))
        ])
      )
      error_message = "compute_provider.aws.microvm.egress_network_connectors must contain at most 10 Lambda network-connector ARNs."
    }

    precondition {
      condition     = try(var.config.iam.additional_policy_json.scale_up, null) == null ? true : can(jsondecode(var.config.iam.additional_policy_json.scale_up))
      error_message = "compute_provider.aws.microvm.iam.additional_policy_json.scale_up must be valid JSON when set."
    }
  }
}

resource "terraform_data" "validate_runner" {
  lifecycle {
    precondition {
      condition     = var.runner.os == "linux" && var.runner.architecture == "arm64"
      error_message = "Lambda MicroVM runners require runner.os = linux and runner.architecture = arm64."
    }

    precondition {
      condition     = length(var.runner.name_prefix) <= 45
      error_message = "runner.name_prefix must be at most 45 characters."
    }
  }
}
