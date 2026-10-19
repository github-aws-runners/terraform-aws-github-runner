resource "terraform_data" "validate_config" {
  lifecycle {
    precondition {
      condition     = contains(["arm64", "x86_64"], var.config.lambda.architecture)
      error_message = "config.lambda.architecture must be arm64 or x86_64."
    }

    precondition {
      condition = contains([
        "silly",
        "trace",
        "debug",
        "info",
        "warn",
        "error",
        "fatal",
      ], var.config.observability.logs.level)
      error_message = "config.observability.logs.level must be one of silly, trace, debug, info, warn, error, or fatal."
    }

    precondition {
      condition     = length(var.config.prefix) + length("job-retry") <= 63
      error_message = "The length of config.prefix plus job-retry must be less than or equal to 63."
    }
  }
}
