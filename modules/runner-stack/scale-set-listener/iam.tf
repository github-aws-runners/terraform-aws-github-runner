data "aws_iam_policy_document" "task_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task" {
  name                 = local.task_role_name
  path                 = var.config.iam.role_path
  permissions_boundary = var.config.iam.permissions_boundary
  assume_role_policy   = data.aws_iam_policy_document.task_assume.json
  tags                 = local.tags
}

resource "aws_iam_role" "execution" {
  name                 = local.execution_role_name
  path                 = var.config.iam.role_path
  permissions_boundary = var.config.iam.permissions_boundary
  assume_role_policy   = data.aws_iam_policy_document.task_assume.json
  tags                 = local.tags
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:${var.config.aws_partition}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

locals {
  github_app_parameter_arns = concat(
    [for parameter in var.config.github.app_parameters.id : parameter.arn],
    [for parameter in var.config.github.app_parameters.key_base64 : parameter.arn],
    [for parameter in var.config.github.app_parameters.installation_id : parameter.arn if parameter != null],
  )
}

data "aws_iam_policy_document" "task_common" {
  statement {
    sid = "ReadGitHubAppCredentials"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]
    resources = local.github_app_parameter_arns
  }

  statement {
    sid = "PublishRunnerJitConfig"
    actions = [
      "ssm:AddTagsToResource",
      "ssm:DeleteParameter",
      "ssm:PutParameter",
    ]
    resources = [var.config.ssm.token_path_arn]
  }

  statement {
    sid     = "DecryptGitHubAppCredentials"
    actions = ["kms:Decrypt"]
    resources = [coalesce(
      var.config.github.kms_key_arn,
      "arn:${var.config.aws_partition}:kms:*:000000000000:key/00000000-0000-0000-0000-000000000000",
    )]
  }
}

resource "aws_iam_role_policy" "task_common" {
  name   = "scale-set-listener-common"
  role   = aws_iam_role.task.name
  policy = data.aws_iam_policy_document.task_common.json
}

resource "aws_iam_role_policy" "task_runner_provider" {
  name   = "scale-set-listener-runner-provider"
  role   = aws_iam_role.task.name
  policy = var.runner_provider.iam_policy_json
}
