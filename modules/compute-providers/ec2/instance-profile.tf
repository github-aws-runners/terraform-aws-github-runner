# The common runner stack owns the role; EC2 owns the profile consumed by its
# launch template.
resource "aws_iam_instance_profile" "runner" {
  count = var.iam_overrides.override_instance_profile ? 0 : 1
  name  = "${var.prefix}-runner-profile"
  role  = var.runner_role.name
  path  = local.instance_profile_path
  tags  = local.provider_tags
}
