provider "aws" {
  region = local.aws_region

  // If you use roles with specific permissions please add your role
  // assume_role {
  //   role_arn = "arn:aws:iam::123456789012:role/MyAdminRole"
  // }
}

provider "random" {
}
