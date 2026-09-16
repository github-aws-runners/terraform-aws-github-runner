environment = "ministack-scale-set"
aws_region  = "eu-west-1"

github = {
  config_url         = "https://mockserver:1080"
  ssl_verify         = false
  runner_owner       = "example"
  registration_level = "organization"
}

github_app = {
  id              = "123"
  key_base64      = "ministack-invalid-key"
  installation_id = "456"
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
  name              = "medium"
  runner_group_name = "experimental-euw1-sl-cicd-forge-emu"
  min_runners       = 1
  container = {
    image = "localhost:4566/scale-set-controller:smoke"
  }
}
