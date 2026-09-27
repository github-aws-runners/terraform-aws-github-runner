resource "aws_ecs_cluster" "controller" {
  count = var.ecs.cluster.mode == "managed" ? 1 : 0

  name = coalesce(var.ecs.cluster.name, "${var.prefix}-scale-set")

  setting {
    name  = "containerInsights"
    value = var.ecs.cluster.container_insights ? "enabled" : "disabled"
  }

  tags = local.common_tags

  depends_on = [terraform_data.validate_runtime]
}
