data "aws_iam_policy_document" "task_assume_role" {
  statement {
    sid     = "AllowEcsTasks"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values = [format(
        "arn:%s:ecs:%s:%s:*",
        data.aws_partition.current.partition,
        data.aws_region.current.region,
        data.aws_caller_identity.current.account_id,
      )]
    }
  }
}

resource "aws_iam_role" "task" {
  for_each = local.controller_groups

  name                 = "${local.group_resource_names[each.key]}-task"
  path                 = var.ecs.iam.path
  permissions_boundary = var.ecs.iam.permissions_boundary
  assume_role_policy   = data.aws_iam_policy_document.task_assume_role.json
  tags                 = local.group_tags[each.key]

  depends_on = [
    terraform_data.validate_contract,
    terraform_data.validate_grouping,
    terraform_data.validate_runtime,
  ]
}

data "aws_iam_policy_document" "task" {
  for_each = local.controller_groups

  source_policy_documents = [local.group_github_kms_policy_json[each.key]]

  statement {
    sid       = "ReadControllerGroupConfig"
    effect    = "Allow"
    actions   = ["ssm:GetParametersByPath"]
    resources = [local.group_config_path_arns[each.key]]
  }

  statement {
    sid    = "ReadGitHubAppParameters"
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]
    resources = local.group_ssm_parameter_arns[each.key]
  }

  dynamic "statement" {
    for_each = local.group_compute_iam_statements[each.key]

    content {
      effect    = "Allow"
      actions   = statement.value.actions
      resources = statement.value.resources

      dynamic "condition" {
        for_each = statement.value.conditions

        content {
          test     = condition.value.test
          variable = condition.value.variable
          values   = condition.value.values
        }
      }
    }
  }
}

resource "aws_iam_role_policy" "task" {
  for_each = local.controller_groups

  name   = "scale-set-controller"
  role   = aws_iam_role.task[each.key].name
  policy = data.aws_iam_policy_document.task[each.key].json

  depends_on = [terraform_data.validate_group_task_policy]
}

resource "aws_iam_role" "execution" {
  for_each = local.controller_groups

  name                 = "${local.group_resource_names[each.key]}-exec"
  path                 = var.ecs.iam.path
  permissions_boundary = var.ecs.iam.permissions_boundary
  assume_role_policy   = data.aws_iam_policy_document.task_assume_role.json
  tags                 = local.group_tags[each.key]

  depends_on = [
    terraform_data.validate_contract,
    terraform_data.validate_grouping,
    terraform_data.validate_runtime,
  ]
}

data "aws_iam_policy_document" "execution" {
  for_each = local.controller_groups

  statement {
    sid    = "WriteControllerLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.controller[each.key].arn}:*"]
  }

  dynamic "statement" {
    for_each = var.container.ecr_repository == null ? [] : [var.container.ecr_repository]

    content {
      sid    = "PullPrivateEcrImage"
      effect = "Allow"
      actions = [
        "ecr:BatchCheckLayerAvailability",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer",
      ]
      resources = [statement.value.arn]
    }
  }

  dynamic "statement" {
    for_each = var.container.ecr_repository == null ? [] : [1]

    content {
      # ECR does not support resource-level permissions for authorization tokens.
      sid       = "AuthorizePrivateEcrPull"
      effect    = "Allow"
      actions   = ["ecr:GetAuthorizationToken"]
      resources = ["*"]
    }
  }
}

resource "aws_iam_role_policy" "execution" {
  for_each = local.controller_groups

  name   = "scale-set-controller-execution"
  role   = aws_iam_role.execution[each.key].name
  policy = data.aws_iam_policy_document.execution[each.key].json
}
