variable "lambdas" {
  description = "Name and tag for lambdas to download."
  type = list(object({
    name = string
    tag  = string
  }))
  default = [{
    name = "ami-housekeeper"
    tag  = "v5.19.0"
    }, {
    name = "runner-binaries-syncer"
    tag  = "v5.19.0"
    }, {
    name = "runners"
    tag  = "v5.19.0"
    }, {
    name = "termination-watcher"
    tag  = "v5.19.0"
    }, {
    name = "webhook"
    tag  = "v5.19.0"
  }]
}
