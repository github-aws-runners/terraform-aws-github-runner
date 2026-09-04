resource "aws_lambdacore_network_connector" "connector" {
  for_each = var.network_connectors

  name          = each.value.name
  operator_role = aws_iam_role.operator.arn

  configuration {
    vpc_egress_configuration {
      associated_compute_resource_types = ["MicroVm"]
      network_protocol                  = each.value.network_protocol
      security_group_ids                = [aws_security_group.connector[each.key].id]
      subnet_ids                        = sort(tolist(each.value.subnet_ids))
    }
  }

  lifecycle {
    precondition {
      condition = alltrue([
        for subnet_id in each.value.subnet_ids :
        data.aws_subnet.selected["${each.key}/${subnet_id}"].vpc_id == each.value.vpc_id
      ])
      error_message = "Every subnet in network_connectors[${each.key}] must belong to its configured vpc_id."
    }
  }

  depends_on = [
    time_sleep.operator_role_propagation,
    aws_vpc_security_group_egress_rule.ipv4,
    aws_vpc_security_group_egress_rule.ipv6,
  ]
}
