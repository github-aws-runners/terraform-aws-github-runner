mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

variables {
  trust_services = ["lambda.amazonaws.com"]
}

run "returns_microvm_assume_role_policy" {
  command = plan

  assert {
    condition     = toset(data.aws_iam_policy_document.assume_role.statement[0].actions) == toset(["sts:AssumeRole", "sts:TagSession"])
    error_message = "The MicroVM runner role must allow assume-role and tagged sessions."
  }

  assert {
    condition = anytrue([
      for principal in data.aws_iam_policy_document.assume_role.statement[0].principals :
      principal.type == "Service" && toset(principal.identifiers) == toset(["lambda.amazonaws.com"])
    ])
    error_message = "The MicroVM runner role must trust the configured service principals."
  }

  assert {
    condition     = output.assume_role_policy == data.aws_iam_policy_document.assume_role.json
    error_message = "The MicroVM runner-role contract must return its rendered assume-role policy."
  }
}
