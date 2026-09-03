resource "aws_security_group" "controller" {
  for_each = local.controller_groups

  name        = local.group_resource_names[each.key]
  description = "Private scale-set controller ${each.key}; no ingress and HTTPS-only egress"
  vpc_id      = var.network.vpc_id

  ingress = []

  egress {
    description      = "HTTPS to GitHub and AWS APIs"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    cidr_blocks      = sort(tolist(var.network.https_egress.ipv4_cidrs))
    ipv6_cidr_blocks = sort(tolist(var.network.https_egress.ipv6_cidrs))
  }

  revoke_rules_on_delete = true
  tags                   = local.group_tags[each.key]

  depends_on = [
    terraform_data.validate_contract,
    terraform_data.validate_grouping,
    terraform_data.validate_runtime,
  ]
}
