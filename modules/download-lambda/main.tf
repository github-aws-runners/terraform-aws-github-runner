resource "null_resource" "download" {
  count = length(var.lambdas)

  triggers = {
    name = var.lambdas[count.index].name
    file = "${var.lambdas[count.index].name}.zip"
    tag  = var.lambdas[count.index].tag
  }

  provisioner "local-exec" {
    command = "curl -o ${self.triggers.file} -L https://github.com/fac/terraform-aws-github-runner/releases/download/${self.triggers.tag}/${self.triggers.name}.zip"
  }
}
