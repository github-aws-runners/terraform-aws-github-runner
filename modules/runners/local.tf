locals {
  parameter_store_tags = jsonencode([
    for key, value in merge(var.tags, var.parameter_store_tags) : {
      Key   = key
      Value = value
    }
  ])
}
