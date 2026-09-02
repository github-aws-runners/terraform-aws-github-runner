aws_region = "eu-west-1"

config = {
  metrics = {
    enable = true
    metric = {
      enable_spot_termination_warning = true
    }
  }
  prefix = "ministack-termination-watcher"
  tag_filters = {
    "ghr:Application" = "github-action-runner"
  }
  zip = "../../tests/ministack/ministack-lambda.zip"
}
