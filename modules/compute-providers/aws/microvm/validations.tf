resource "terraform_data" "validate_config" {
  lifecycle {
    precondition {
      condition     = can(regex("^arn:[^:]+:lambda:[^:]+:[0-9]{12}:microvm-image:.+$", var.config.image_arn))
      error_message = "compute_provider.aws.microvm.image_arn must be a Lambda MicroVM image ARN."
    }

    precondition {
      condition = var.config.iam.resource_arns.images == null ? true : (
        length(var.config.iam.resource_arns.images) > 0 &&
        alltrue([
          for image_arn in var.config.iam.resource_arns.images :
          image_arn == "*" || can(regex("^arn:[^:]+:lambda:[^:]+:[0-9]{12}:microvm-image:.+$", image_arn))
        ])
      )
      error_message = "compute_provider.aws.microvm.iam.resource_arns.images must be null or a non-empty list containing only * or Lambda MicroVM image ARN patterns."
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

    precondition {
      condition = !(
        local.microvm_metadata_ssm_path == local.runner_jit_ssm_path ||
        startswith(local.microvm_metadata_ssm_path, "${local.runner_jit_ssm_path}/") ||
        startswith(local.runner_jit_ssm_path, "${local.microvm_metadata_ssm_path}/")
      )
      error_message = "The MicroVM metadata Parameter Store path must be separate from the runner JIT configuration path."
    }

    precondition {
      condition = (
        startswith(var.ssm.paths.root, "/") &&
        trim(var.ssm.paths.root, "/") != "" &&
        trim(var.ssm.paths.config, "/") != "" &&
        can(regex("^/[A-Za-z0-9_./-]+$", local.microvm_metadata_ssm_path)) &&
        !strcontains(local.microvm_metadata_ssm_path, "//")
      )
      error_message = "The derived MicroVM metadata Parameter Store path must be an absolute path containing only letters, numbers, dot, underscore, hyphen, and slash."
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
