module "spot_termination_watchter" {
  config = {
    metrics = {
      enable = true
      metric = {
        enable_spot_termination_warning = true
      }
    }
    prefix = "global"
    tag_filters = {
      "ghr:Application" = "github-action-runner"
    }
    zip = var.ministack_lambda_archive
  }
}
