variable "lambda_tracing_mode" {
  description = "DEPRECATED: Replaced by `tracing_config`."
  type        = string
  default     = null

  validation {
    condition     = anytrue([var.lambda_tracing_mode == null])
    error_message = "DEPRECATED, Replaced by `tracing_config`."
  }
}

variable "enable_event_rule_binaries_syncer" {
  description = "DEPRECATED: Replaced by `state_event_rule_binaries_syncer`."
  type        = bool
  default     = null
  validation {
    condition     = var.enable_event_rule_binaries_syncer == null
    error_message = "DEPRECATED, Replaced by `state_event_rule_binaries_syncer`."
  }
}
