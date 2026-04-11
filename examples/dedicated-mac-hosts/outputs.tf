output "resource_group_arns" {
  description = "Map of resource group names to their ARNs."
  value = {
    for k, rg in aws_resourcegroups_group.mac_host_group :
    rg.name => rg.arn
  }
}

output "license_specification_arn" {
  description = "ARN of the License Manager configuration used for Mac dedicated hosts."
  value       = aws_licensemanager_license_configuration.mac_dedicated_host_license_configuration.arn
}
