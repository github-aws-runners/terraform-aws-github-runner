variable "additional_trust_policy_json" {
  description = "Optional IAM policy document merged with the default EC2 runner-role trust policy."
  type        = string
  default     = null
}
