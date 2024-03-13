module "spot_termination_watchter" {
  source = "../../modules/termination-watcher"

  config = {
    enable_metric = {
      spot_warning = true
    }
    prefix = "global"
    tag_filters = {
      "ghr:Application" = "github-action-runner"
    }
  }
}