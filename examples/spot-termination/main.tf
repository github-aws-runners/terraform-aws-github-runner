module "spot_termination_watchter" {
  source = "../../modules/termination-watcher"

  config = {
    enable = true
    prefix = "npalm-test"
  }
}