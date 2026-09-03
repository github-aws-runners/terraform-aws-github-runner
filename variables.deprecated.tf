variable "enable_organization_runners" {
  description = "DEPRECATED: Use `runner_registration_level` instead. Register runners to organization (true) or repository (false). If set to `true`, it takes priority over `runner_registration_level` for backwards compatibility. This variable will be removed in a future major version."
  type        = bool
  default     = false
}
