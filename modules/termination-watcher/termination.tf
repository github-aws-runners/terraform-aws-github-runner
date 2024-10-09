module "termination_handler" {
  count  = var.config.features.enable_spot_termination_handler ? 1 : 0
  source = "./termination"

  config = local.config
}
