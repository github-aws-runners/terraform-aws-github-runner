# Action runners deployment default example

This modules shows how to create GitHub action runners. Lambda release will be downloaded from GitHub.

## Usages

Steps for the full setup, such as creating a GitHub app can be find the module [README](../../README.md). First download the Lambda releases from GitHub. Alternatively you can build the lamda's locally with Node or Docker, there is a simple build script in `<root>/.ci/build.sh`. In the `main.tf` you can simple remove the location of the lambda zip files, the default location will work in this case.

```bash
cd lambdas-download
terraform init
terraform apply
cd ..
```

Before running Terraform, ensure the GitHub app is configured.

```bash
terraform init
terraform apply
```
