# Lambda assumes this role while building an image snapshot.
data "aws_iam_policy_document" "build" {
  statement {
    sid       = "ReadRegionalBuildArtifact"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.artifacts.arn}/${local.artifact_prefix}/*"]
  }

  statement {
    sid       = "CreateMicrovmBuildLogGroups"
    effect    = "Allow"
    actions   = ["logs:CreateLogGroup"]
    resources = [local.log_group_arn_pattern]
  }

  statement {
    sid    = "WriteMicrovmBuildLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = [local.log_stream_arn_pattern]
  }

  dynamic "statement" {
    for_each = length(var.ecr_repository_arns) > 0 ? [true] : []
    content {
      sid       = "AuthorizePrivateEcrPull"
      effect    = "Allow"
      actions   = ["ecr:GetAuthorizationToken"]
      resources = ["*"]
    }
  }

  dynamic "statement" {
    for_each = length(var.ecr_repository_arns) > 0 ? [true] : []
    content {
      sid    = "PullPrivateEcrImage"
      effect = "Allow"
      actions = [
        "ecr:BatchCheckLayerAvailability",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer",
      ]
      resources = var.ecr_repository_arns
    }
  }
}

resource "aws_iam_policy" "build" {
  name_prefix = var.build_policy_name_prefix
  description = "Regional permissions used by Lambda while building MicroVM images."
  policy      = data.aws_iam_policy_document.build.json
  tags        = var.tags
}

resource "aws_iam_role_policy_attachment" "build" {
  role       = aws_iam_role.build.name
  policy_arn = aws_iam_policy.build.arn
}

data "aws_iam_policy_document" "lambda_service_assume_role" {
  statement {
    sid    = "LambdaMicrovmService"
    effect = "Allow"
    actions = [
      "sts:AssumeRole",
      "sts:TagSession",
    ]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "build" {
  name_prefix        = var.build_role_name_prefix
  assume_role_policy = data.aws_iam_policy_document.lambda_service_assume_role.json
  tags               = var.tags
}
