environment = "ministack-scale-set"
aws_region  = "eu-west-1"

github_app = {
  id              = "0"
  key_base64      = "ministack-invalid-key"
  installation_id = "1"
}

runner_binaries_enabled = false

ami = {
  "linux-arm64" = {
    filter = {
      name  = ["ministack-scale-set-linux-arm64"]
      state = ["available"]
    }
    owners = ["self"]
  }
  "linux-x64" = {
    filter = {
      name  = ["ministack-scale-set-linux-x64"]
      state = ["available"]
    }
    owners = ["self"]
  }
  "linux-scale-set" = {
    filter = {
      name  = ["ministack-scale-set-linux-x64"]
      state = ["available"]
    }
    owners = ["self"]
  }
  "windows-x64" = {
    filter = {
      name  = ["ministack-scale-set-windows-x64"]
      state = ["available"]
    }
    owners = ["self"]
  }
}

scale_set = {
  config_url                = "https://github.com/example"
  name                      = "ministack-scale-set"
  id                        = 1
  runner_group_id           = 1
  runner_owner              = "example"
  runner_registration_level = "organization"
}
