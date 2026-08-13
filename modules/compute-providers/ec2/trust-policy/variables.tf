variable "additional_trust_policy_json" {
  description = "Optional IAM policy document merged with the default EC2 runner-role trust policy."
  type        = string
  default     = null

  validation {
    condition     = var.additional_trust_policy_json == null ? true : can(jsondecode(var.additional_trust_policy_json))
    error_message = "additional_trust_policy_json must be valid JSON when set."
  }
}
