variable "ministack_lambda_archive" {
  description = "Absolute path to the inert Lambda archive created by the MiniStack fixture."
  type        = string

  validation {
    condition     = endswith(var.ministack_lambda_archive, "/tests/ministack/setup/.terraform/ministack/lambda.zip")
    error_message = "The MiniStack Lambda archive must come from the isolated test fixture."
  }
}

locals {
  ministack_ami = {
    filter = {
      name  = ["amzn2-ami-hvm-2.0.20231116.0-x86_64-gp2"]
      state = ["available"]
    }
    owners = ["self"]
  }
}
