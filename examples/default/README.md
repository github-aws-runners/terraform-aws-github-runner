# Action runners deployment default example

This module shows how to create GitHub action runners. Lambda release will be downloaded from GitHub.

## Usages

Steps for the full setup, such as creating a GitHub app can be found in the root module's [README](../../README.md). This examples expects you have locally build zip files of the lambda in the lambda directory in the submodules. T

You can build the lambdas locally with Node/Yarn (`<root>/.ci/build-yarn.sh`) or Docker (`<root>/.ci/build.sh`). The yarn build will write the zip files in the module dist directory. The Docker build will create the zip files in `lambda_ourput`. Alternatively you can download the lambda's via the submodule. Ensure you have set the version in `lambdas-download/main.tf` for running the example. The version needs to be set to a GitHub release version, see https://github.com/philips-labs/terraform-aws-github-runner/releases

Only required for downloading lambda releases.

```bash
cd ../lambdas-download
terraform init
terraform apply -var=module_version=<VERSION>
cd -
```

Before running Terraform, ensure the GitHub app is configured. See the [configuration details](../../README.md#usages) for more details.

```bash
terraform init
terraform apply
```

You can receive the webhook details by running:

```bash
terraform output -raw webhook_secret
```

Be-aware some shells will print some end of line character `%`.
