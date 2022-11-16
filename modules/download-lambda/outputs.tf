output "files" {
  value = null_resource.download[*].triggers.file
}
