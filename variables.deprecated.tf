variable "enabled_userdata" {
  description = "DEPRECATED: Replaced by `enable_userdata`."
  type        = string
  default     = null

  validation {
    condition     = anytrue([var.enabled_userdata == null])
    error_message = "DEPRECATED, replaced by `enable_userdata`."
  }
}

variable "runner_enable_workflow_job_labels_check_all" {
  description = "DEPRECATED: Replaced by `enable_runner_workflow_job_labels_check_all`."
  type        = string
  default     = null

  validation {
    condition     = anytrue([var.runner_enable_workflow_job_labels_check_all == null])
    error_message = "DEPRECATED, replaced by `enable_runner_workflow_job_labels_check_all`."
  }
}

variable "fifo_build_queue" {
  description = "DEPRECATED: Replaced by `enable_fifo_build_queue`."
  type        = string
  default     = null

  validation {
    condition     = anytrue([var.fifo_build_queue == null])
    error_message = "DEPRECATED, replaced by `enable_fifo_build_queue`."
  }
}

variable "enable_enable_fifo_build_queue" {
  description = "DEPRECATED: Replaced by `enable_fifo_build_queue` / `fifo_build_queue`."
  type        = string
  default     = null

  validation {
    condition     = anytrue([var.enable_enable_fifo_build_queue == null])
    error_message = "DEPRECATED, replaced by `enable_fifo_build_queue`."
  }
}
