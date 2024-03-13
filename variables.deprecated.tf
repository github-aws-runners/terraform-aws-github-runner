# tflint-ignore: terraform_unused_declarations
variable "lambda_tracing_mode" {
  description = "DEPRECATED: Replaced by `tracing_config`."
  type        = string
  default     = null

  validation {
    condition     = anytrue([var.lambda_tracing_mode == null])
    error_message = "DEPRECATED, Replaced by `tracing_config`."
  }
}

# tflint-ignore: terraform_unused_declarations
variable "enable_event_rule_binaries_syncer" {
  description = "DEPRECATED: Replaced by `state_event_rule_binaries_syncer`."
  type        = bool
  default     = null
  validation {
    condition     = var.enable_event_rule_binaries_syncer == null
    error_message = "DEPRECATED, Replaced by `state_event_rule_binaries_syncer`."
  }
}


# tflint-ignore: terraform_naming_convention
variable "runners_scale_up_Lambda_memory_size" {
  description = "Memory size limit in MB for scale-up lambda."
  type        = number
  default     = null
}