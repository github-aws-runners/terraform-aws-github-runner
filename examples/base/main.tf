resource "aws_resourcegroups_group" "resourcegroups_group" {
  name = "${var.prefix}-group"
  resource_query {
    query = templatefile("${path.module}/templates/resource-group.json", {
      example = var.prefix
    })
  }
}
