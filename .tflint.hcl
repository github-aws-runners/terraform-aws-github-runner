config {
  format = "compact"
  call_module_type = "local"
}

plugin "aws" {
    enabled = true
    version = "0.36.0"
    source  = "github.com/terraform-linters/tflint-ruleset-aws"
}

rule "terraform_comment_syntax" {
    enabled = true
}

rule "terraform_naming_convention" {
  enabled = true
}

rule "terraform_documented_variables" {
  enabled = true
}
