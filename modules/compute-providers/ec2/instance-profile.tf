# The common runner configuration owns the role; EC2 owns the profile consumed by its
# launch template.
resource "aws_iam_instance_profile" "runner" {
  count = var.config.instance_profile == null ? 1 : 0
  name  = "${var.prefix}-runner-profile"
  role  = var.runner.iam.role.name
  path  = local.instance_profile_path
  tags  = local.provider_tags
}
