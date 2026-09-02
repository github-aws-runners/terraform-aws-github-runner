module "spot_termination_watchter" {
  source = "../../modules/termination-watcher"

  config = var.config
}
