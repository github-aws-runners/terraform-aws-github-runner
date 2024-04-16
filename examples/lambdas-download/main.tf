module "lambdas" {
  source = "../../modules/download-lambda"
  lambdas = [
    {
      name = "webhook"
      tag  = var.module_version
    },
    {
      name = "runners"
      tag  = var.module_version
    },
    {
      name = "runner-binaries-syncer"
      tag  = var.module_version
    },
    {
      name = "ami-housekeeper"
      tag  = var.module_version
    },
    {
      name = "termination-watcher"
      tag  = var.module_version
    }
  ]
}

output "files" {
  value = module.lambdas.files
}
