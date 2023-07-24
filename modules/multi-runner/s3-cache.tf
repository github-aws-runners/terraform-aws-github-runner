# module "s3-cache" {
#   source   = "../s3-cache"
#   for_each = local.runner_config
#   # prefix   = "${var.prefix}-${each.key}"
#   bucket_name = "${var.prefix}-${each.key}"
#   tags = merge(local.tags, {
#     "ghr:environment" = "${var.prefix}-${each.key}"
#   })
# }
