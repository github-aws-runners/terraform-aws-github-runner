environment = "ministack-multi-runner-v2"
aws_region  = "eu-west-1"

github_app = {
  id         = "0"
  key_base64 = "ministack-invalid-key"
}

ami = {
  "linux-arm64" = {
    filter = {
      name  = ["ministack-v2-linux-arm64"]
      state = ["available"]
    }
    owners = ["self"]
  }
  "linux-x64" = {
    filter = {
      name  = ["ministack-v2-linux-x64"]
      state = ["available"]
    }
    owners = ["self"]
  }
  "windows-x64" = {
    filter = {
      name  = ["ministack-v2-windows-x64"]
      state = ["available"]
    }
    owners = ["self"]
  }
}
