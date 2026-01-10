locals {

  environment = var.environment != null ? var.environment : "default"
  aws_region  = var.aws_region

  # Flatten host_groups into a map of individual host definitions keyed by
  # "groupKey-hostName" so we can create one aws_ec2_host per host.
  mac_dedicated_hosts = merge([
    for group_key, group in var.host_groups : {
      for host in group.hosts :
      "${group_key}-${host.name}" => {
        instance_type     = group.host_instance_type
        availability_zone = host.availability_zone
        group_name        = group.name
        host_name         = host.name
      }
    }
  ]...)
}

resource "aws_ec2_host" "mac_dedicated_host" {
  for_each = local.mac_dedicated_hosts

  instance_type     = each.value.instance_type
  availability_zone = each.value.availability_zone
  auto_placement    = "on"

  tags = {
    "Name"      = each.value.host_name
    "HostGroup" = each.value.group_name
  }
}

resource "aws_resourcegroups_group" "mac_host_group" {
  for_each = { for _, group in var.host_groups : group.name => group }

  name = each.value.name

  configuration {
    type = "AWS::EC2::HostManagement"

    parameters {
      name   = "any-host-based-license-configuration"
      values = ["true"]
    }

    parameters {
      name = "auto-allocate-host"
      values = [
        "false",
      ]
    }
    parameters {
      name = "auto-host-recovery"
      values = [
        "false",
      ]
    }
    parameters {
      name = "auto-release-host"
      values = [
        "false",
      ]
    }
  }

  configuration {
    type = "AWS::ResourceGroups::Generic"
    parameters {
      name = "allowed-resource-types"
      values = [
        "AWS::EC2::Host",
      ]
    }

    parameters {
      name = "deletion-protection"
      values = [
        "UNLESS_EMPTY",
      ]
    }
  }

  tags = {
    "Name" = each.value.name
  }
}

resource "aws_resourcegroups_resource" "mac_host_membership" {
  for_each = local.mac_dedicated_hosts

  group_arn    = aws_resourcegroups_group.mac_host_group[each.value.group_name].arn
  resource_arn = aws_ec2_host.mac_dedicated_host[each.key].arn
}


resource "aws_licensemanager_license_configuration" "mac_dedicated_host_license_configuration" {
  name                  = "mac-dedicated-host-license-configuration"
  description           = "Mac dedicated host license configuration"
  license_counting_type = "Socket"

  tags = {
    "Name" = each.value.name
  }
}
