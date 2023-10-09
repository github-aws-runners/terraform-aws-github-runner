data "aws_route_tables" "private" {
  vpc_id = var.config.vpc_id
  filter {
    name   = "tag:Name"
    values = ["*private"]
  }
}

resource "aws_vpc_endpoint" "s3" {
  vpc_id          = var.config.vpc_id
  route_table_ids = data.aws_route_tables.private.ids
  service_name    = "com.amazonaws.${var.config.aws_region}.s3"
}
