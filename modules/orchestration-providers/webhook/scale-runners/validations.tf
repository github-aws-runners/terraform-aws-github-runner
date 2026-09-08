resource "terraform_data" "validate_config" {
  lifecycle {
    precondition {
      condition     = !var.config.job_retry.enabled || var.config.job_retry.queue != null
      error_message = "config.job_retry.queue must be set when config.job_retry.enabled is true."
    }
  }
}
