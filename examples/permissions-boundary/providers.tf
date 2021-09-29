provider "aws" {
  alias   = "terraform_role"
  region  = local.aws_region
  version = "3.60"
  assume_role {
    role_arn = data.terraform_remote_state.iam.outputs.role
  }
}
