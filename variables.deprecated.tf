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

# tflint-ignore: terraform_unused_declarations
variable "enable_metrics_control_plane" {
  description = "(Experimental) Enable or disable the metrics for the module. Feature can change or renamed without a major release."
  type        = bool
  default     = null

  # depcreated
  validation {
    condition     = var.enable_metrics_control_plane == null
    error_message = "The variable `enable_metrics_control_plane` is deprecated, use `metrics.enabled` instead."
  }
}

# tflint-ignore: terraform_unused_declarations
variable "metrics_namespace" {
  description = "The namespace for the metrics created by the module. Merics will only be created if explicit enabled."
  type        = string
  default     = null

  validation {
    condition     = var.metrics_namespace == null
    error_message = "The variable `metrics_namespace` is deprecated, use `metrics.namespace` instead."
  }
}
