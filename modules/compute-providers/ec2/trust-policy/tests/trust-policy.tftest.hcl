mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{}"
    }
  }
}

run "returns_default_ec2_trust_policy" {
  command = plan

  assert {
    condition     = toset(data.aws_iam_policy_document.default.statement[0].actions) == toset(["sts:AssumeRole"])
    error_message = "The default EC2 runner role trust policy must allow sts:AssumeRole."
  }

  assert {
    condition = anytrue([
      for principal in data.aws_iam_policy_document.default.statement[0].principals :
      principal.type == "Service" && toset(principal.identifiers) == toset(["ec2.amazonaws.com"])
    ])
    error_message = "The default EC2 runner role trust policy must trust the EC2 service principal."
  }

  assert {
    condition = (
      length(data.aws_iam_policy_document.assume_role.source_policy_documents) == 1
      && output.assume_role_policy == data.aws_iam_policy_document.assume_role.json
    )
    error_message = "The submodule must return the final EC2 assume-role policy."
  }
}

run "merges_additional_trust_policy" {
  command = plan

  variables {
    additional_trust_policy_json = jsonencode({
      Version = "2012-10-17"
      Statement = [{
        Sid       = "TrustedAccount"
        Effect    = "Allow"
        Action    = "sts:AssumeRole"
        Principal = { AWS = "arn:aws:iam::123456789012:root" }
      }]
    })
  }

  assert {
    condition = (
      length(data.aws_iam_policy_document.assume_role.source_policy_documents) == 2
      && data.aws_iam_policy_document.assume_role.source_policy_documents[1] == var.additional_trust_policy_json
      && output.assume_role_policy == data.aws_iam_policy_document.assume_role.json
    )
    error_message = "The submodule must merge the additional trust policy into the final assume-role policy."
  }
}

run "rejects_invalid_additional_trust_policy" {
  command = plan

  variables {
    additional_trust_policy_json = "not-json"
  }

  expect_failures = [var.additional_trust_policy_json]
}
