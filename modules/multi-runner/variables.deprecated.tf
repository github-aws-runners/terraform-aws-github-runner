# tflint-ignore: terraform_unused_declarations
variable "enable_metrics_control_plane" {
  description = "(Experimental) Enable or disable the metrics for the module. Feature can change or renamed without a major release."
  type        = bool
  default     = false

  validation {
    condition     = var.enable_metrics_control_plane == false
    error_message = "The feature `enable_metrics_control_plane` is deprecated and will be removed in a future release. Please use the `metrics` variable instead."
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
