mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{}"
    }
  }
}

run "returns_default_microvm_trust_policy" {
  command = plan

  assert {
    condition     = toset(data.aws_iam_policy_document.default.statement[0].actions) == toset(["sts:AssumeRole", "sts:TagSession"])
    error_message = "The MicroVM runner role must allow assume-role and tagged sessions."
  }

  assert {
    condition = anytrue([
      for principal in data.aws_iam_policy_document.default.statement[0].principals :
      principal.type == "Service" && toset(principal.identifiers) == toset(["lambda.amazonaws.com"])
    ])
    error_message = "The MicroVM runner role must trust the Lambda service principal required by the provider."
  }

  assert {
    condition = (
      length(data.aws_iam_policy_document.assume_role.source_policy_documents) == 1
      && output.assume_role_policy == data.aws_iam_policy_document.assume_role.json
    )
    error_message = "The MicroVM trust-policy module must return the default trust document as assume_role_policy."
  }
}

run "merges_additional_trust_policy" {
  command = plan

  variables {
    additional_trust_policy_json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"TrustDeploymentRole\",\"Effect\":\"Allow\",\"Action\":\"sts:AssumeRole\",\"Principal\":{\"AWS\":\"arn:aws:iam::123456789012:role/deployer\"}}]}"
  }

  assert {
    condition = (
      length(data.aws_iam_policy_document.assume_role.source_policy_documents) == 2
      && contains(data.aws_iam_policy_document.assume_role.source_policy_documents, var.additional_trust_policy_json)
      && output.assume_role_policy == data.aws_iam_policy_document.assume_role.json
    )
    error_message = "The MicroVM trust-policy module must merge and return the additional trust policy document."
  }
}

run "rejects_invalid_additional_trust_policy" {
  command = plan

  variables {
    additional_trust_policy_json = "{"
  }

  expect_failures = [var.additional_trust_policy_json]
}
