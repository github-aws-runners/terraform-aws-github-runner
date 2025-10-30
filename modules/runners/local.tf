locals {
  parameter_store_tags = "[${join(", ", [
    for key, value in var.parameter_store_tags : "{ key = \"${key}\", value = \"${value}\" }"
  ])}]"
}
