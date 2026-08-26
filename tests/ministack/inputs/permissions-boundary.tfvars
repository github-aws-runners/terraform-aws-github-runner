github_app = {
  id         = "0"
  key_base64 = "ministack-invalid-github-app-key"
}
ami = {
  filter = {
    name  = ["amzn2-ami-hvm-2.0.20231116.0-x86_64-gp2"]
    state = ["available"]
  }
  owners = ["self"]
}
aws_s3_use_path_style = true
