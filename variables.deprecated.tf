variable "lambda_tracing_mode" {
  description = "DEPRECATED: Replaced by `tracing_config`."
  type        = string
  default     = null

  validation {
    condition     = anytrue([var.lambda_tracing_mode == null])
    error_message = "DEPRECATED, Replaced by `tracing_config`."
  }
}
