resource "terraform_data" "validate_config" {
  lifecycle {
    precondition {
      condition = !(
        var.config.lambda.artifact.zip != null &&
        var.config.lambda.artifact.s3 != null
      )
      error_message = "config.lambda.artifact must select at most one of zip or s3."
    }
  }
}
