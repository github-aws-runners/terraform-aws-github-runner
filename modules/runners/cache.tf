module "cache" {
  count = var.create_cache_bucket ? 1 : 0

  source = "./cache"

  config = {
    prefix = var.prefix
    tags   = local.tags
  }
}
