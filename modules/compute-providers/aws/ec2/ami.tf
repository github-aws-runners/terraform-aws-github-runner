locals {
  # Handle AMI configuration
  ami_config = var.config.ami != null ? var.config.ami : {
    filter        = local.default_ami[var.runner.os]
    owners        = ["amazon"]
    ssm_parameter = null
    kms_key       = null
  }
  ami_kms_key_enabled       = local.ami_config.kms_key != null
  ami_kms_key_arn           = local.ami_kms_key_enabled ? local.ami_config.kms_key.arn : null
  ami_filter                = merge(local.default_ami[var.runner.os], local.ami_config.filter)
  ami_id_ssm_external       = local.ami_config.ssm_parameter != null && local.ami_config.ssm_parameter.path == null
  ami_id_ssm_module_managed = local.ami_config.ssm_parameter != null && local.ami_config.ssm_parameter.path != null
  ami_id_ssm_parameter_arn  = local.ami_id_ssm_external ? local.ami_config.ssm_parameter.arn : null
  # Extract parameter name from ARN (format: arn:aws:ssm:region:account:parameter/path/to/param)
  ami_id_ssm_parameter_name = local.ami_id_ssm_external ? try(regex("parameter(/.+)$", local.ami_id_ssm_parameter_arn)[0], null) : null

  image_id = local.ami_id_ssm_module_managed ? "resolve:ssm:${aws_ssm_parameter.runner_ami_id[0].arn}" : local.ami_id_ssm_external ? "resolve:ssm:${local.ami_id_ssm_parameter_arn}" : data.aws_ami.runner[0].id
}

data "aws_ami" "runner" {
  count = local.ami_id_ssm_external ? 0 : 1

  most_recent = "true"

  dynamic "filter" {
    for_each = local.ami_filter
    content {
      name   = filter.key
      values = filter.value
    }
  }

  owners = local.ami_config.owners
}

resource "aws_ssm_parameter" "runner_ami_id" {
  count     = local.ami_id_ssm_module_managed ? 1 : 0
  name      = "${local.ami_config.ssm_parameter.path}/ami_id"
  type      = "String"
  data_type = "aws:ec2:image"
  value     = data.aws_ami.runner[0].id

  tags = merge(
    local.provider_tags,
    local.ssm_parameter_tags,
    {
      # Remove parentheses from AMI name to comply with AWS tag constraints
      "ghr:ami_name" = replace(data.aws_ami.runner[0].name, "/[()]/", "")
    },
    {
      "ghr:ami_creation_date" = data.aws_ami.runner[0].creation_date
    },
    {
      "ghr:ami_deprecation_time" = data.aws_ami.runner[0].deprecation_time
    }
  )
}
