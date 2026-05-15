# tflint-ignore: terraform_unused_declarations
variable "enable_organization_runners" {
  description = "DEPRECATED: Use `runner_registration_level` instead. Register runners to organization (true) or repository (false)."
  type        = bool
  default     = false

  validation {
    condition     = var.enable_organization_runners == false
    error_message = "DEPRECATED: 'enable_organization_runners' is deprecated. Use 'runner_registration_level' instead."
  }
}
