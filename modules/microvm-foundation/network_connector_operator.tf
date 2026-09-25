data "aws_iam_policy_document" "network_connector_assume_operator_role" {
  statement {
    sid     = "LambdaNetworkConnectorService"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["network-connectors.lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "operator" {
  name_prefix        = var.network_connector_operator_role_name_prefix
  assume_role_policy = data.aws_iam_policy_document.network_connector_assume_operator_role.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "operator" {
  role       = aws_iam_role.operator.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AWSLambdaNetworkConnectorOperatorPolicy"
}

# IAM reports role and policy writes before they are consistently available to
# Lambda. Wait before allowing the native Network Connector resource to create
# any connector.
resource "time_sleep" "operator_role_propagation" {
  depends_on = [aws_iam_role_policy_attachment.operator]

  create_duration = "30s"

  triggers = {
    operator_role_unique_id      = aws_iam_role.operator.unique_id
    operator_trust_policy_sha256 = sha256(aws_iam_role.operator.assume_role_policy)
  }

  lifecycle {
    replace_triggered_by = [aws_iam_role_policy_attachment.operator]
  }
}
