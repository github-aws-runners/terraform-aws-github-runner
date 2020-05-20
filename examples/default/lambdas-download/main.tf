module "lambdas" {
  source = "../../../modules/download-lambda"
  lambdas = [
    {
      name = "webhook"
      tag  = "v0.0.1"
    },
    {
      name = "runners"
      tag  = "v0.0.1"
    },
    {
      name = "runner-binaries-syncer"
      tag  = "v0.0.1"
    }
  ]
}

output "files" {
  value = module.lambdas.files
}
