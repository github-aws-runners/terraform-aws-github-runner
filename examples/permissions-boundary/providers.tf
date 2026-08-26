provider "aws" {
  alias             = "terraform_role"
  region            = local.aws_region
  s3_use_path_style = var.aws_s3_use_path_style
  assume_role {
    role_arn = data.terraform_remote_state.iam.outputs.role
  }
}
