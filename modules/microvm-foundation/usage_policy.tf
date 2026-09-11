# Consumer modules can attach this policy to a control-plane role they own.
# This helper deliberately leaves the managed policy unattached.
data "aws_iam_policy_document" "usage" {
  statement {
    sid    = "UseConfiguredMicrovmImages"
    effect = "Allow"
    actions = [
      "lambda:CreateMicrovmAuthToken",
      "lambda:GetMicrovm",
      "lambda:GetMicrovmImage",
      "lambda:GetMicrovmImageVersion",
      "lambda:ListMicrovmImageVersions",
      "lambda:ResumeMicrovm",
      "lambda:RunMicrovm",
      "lambda:SuspendMicrovm",
      "lambda:TerminateMicrovm",
    ]
    resources = [local.image_arn_pattern]
  }

  #checkov:skip=CKV_AWS_111:ListMicrovms and ListMicrovmImages do not support resource-level permissions.
  #checkov:skip=CKV_AWS_356:Lambda MicroVM account-level list actions require Resource '*'.
  statement {
    sid    = "DiscoverMicrovmRuntimeState"
    effect = "Allow"
    actions = [
      "lambda:ListMicrovmImages",
      "lambda:ListMicrovms",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "ReadConfiguredNetworkConnectors"
    effect    = "Allow"
    actions   = ["lambda:GetNetworkConnector"]
    resources = values(local.connector_arns)
  }

  #checkov:skip=CKV_AWS_111:PassNetworkConnector and ListNetworkConnectors do not support resource-level permissions.
  #checkov:skip=CKV_AWS_356:Lambda requires Resource '*' for PassNetworkConnector and the account-level list operation.
  statement {
    sid    = "PassAndDiscoverNetworkConnectors"
    effect = "Allow"
    actions = [
      "lambda:ListNetworkConnectors",
      "lambda:PassNetworkConnector",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "usage" {
  name_prefix = var.usage_policy_name_prefix
  description = "Permissions to discover and operate configured Lambda MicroVM images and to read and pass their regional Network Connectors."
  policy      = data.aws_iam_policy_document.usage.json
  tags        = var.tags
}
