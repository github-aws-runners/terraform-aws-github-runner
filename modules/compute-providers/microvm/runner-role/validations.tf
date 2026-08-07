resource "terraform_data" "validate_config" {
  lifecycle {
    precondition {
      condition     = length(var.trust_services) > 0
      error_message = "compute_provider.microvm.runner_role_trust_services must contain at least one service principal."
    }
  }
}
