# A connector gets its own no-ingress security group. Route tables and NACLs on
# the caller-selected subnets determine actual destinations reachable through
# the IPv4 or dual-stack egress rules.
resource "aws_security_group" "connector" {
  #checkov:skip=CKV2_AWS_5:The security group is consumed by the Lambda Network Connector rather than by a Terraform-native ENI resource.
  for_each = var.network_connectors

  name        = "microvm-${each.value.name}-${var.aws_region}"
  description = "Outbound egress for the ${each.value.name} Lambda MicroVM Network Connector"
  vpc_id      = each.value.vpc_id

  tags = merge(var.tags, {
    Name = "microvm-${each.value.name}-${var.aws_region}"
  })
}

resource "aws_vpc_security_group_egress_rule" "ipv4" {
  #checkov:skip=CKV_AWS_382:The connector requires outbound access; subnet routes and NACLs provide the network destination boundary.
  for_each = var.network_connectors

  security_group_id = aws_security_group.connector[each.key].id
  description       = "Lambda MicroVM connector IPv4 egress"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
  tags              = var.tags
}

resource "aws_vpc_security_group_egress_rule" "ipv6" {
  #checkov:skip=CKV_AWS_382:Dual-stack connector egress is intentional; subnet routes and NACLs provide the network destination boundary.
  for_each = {
    for connector_key, connector in var.network_connectors :
    connector_key => connector if connector.network_protocol == "DualStack"
  }

  security_group_id = aws_security_group.connector[each.key].id
  description       = "Lambda MicroVM connector IPv6 egress"
  ip_protocol       = "-1"
  cidr_ipv6         = "::/0"
  tags              = var.tags
}
