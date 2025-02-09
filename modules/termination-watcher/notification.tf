module "termination_notification" {
  count  = var.config.features.enable_spot_termination_notification_watcher ? 1 : 0
  source = "./notification"

  config = local.config
}
