resource "terraform_data" "validate_config" {
  lifecycle {
    precondition {
      condition     = var.additional_trust_policy_json == null ? true : can(jsondecode(var.additional_trust_policy_json))
      error_message = "additional_trust_policy_json must be valid JSON when set."
    }
  }
}
