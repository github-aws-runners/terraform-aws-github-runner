module "spot_termination_watchter" {
  source = "../../modules/termination-watcher"

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
  }
}
