# Action runners deployment with prebuilt image

This module shows how to create GitHub action runners using a prebuilt AMI for the runners

## Usages

Steps for the full setup, such as creating a GitHub app can be found in the root module's [README](../../README.md). 

### Lambdas

You can either download the released lambda code or build them locally yourself.

First download the Lambda releases from GitHub. Ensure you have set the version in `lambdas-download/main.tf` for running the example. The version needs to be set to a GitHub release version, see https://github.com/philips-labs/terraform-aws-github-runner/releases

```bash
cd lambdas-download
terraform init
terraform apply
cd ..
```

Alternatively you can build the lambdas locally with Node or Docker, there is a simple build script in `<root>/.ci/build.sh`. In the `main.tf` you need to specify the build location for all of the zip files.

```hcl
  webhook_lambda_zip                = "../../lambda_output/webhook.zip"
  runner_binaries_syncer_lambda_zip = "../../lambda_output/runner-binaries-syncer.zip"
  runners_lambda_zip                = "../../lambda_output/runners.zip"
```

### GitHub App Configuration

Before running Terraform, ensure the GitHub app is configured. See the [configuration details](../../README.md#usages) for more details.

### Packer Image

You will need to build your image. This example deployment uses the image example in `/images/linux-amz2`. You must build this image with packer in your AWS account first. Once you have built this you need to provider your owner ID as a variable

## Deploy

You can then deploy the terraform

```bash
terraform init
terraform apply
```

You can receive the webhook details by running:

```bash
terraform output -raw webhook_secret
```

Be-aware some shells will print some end of line character `%`.
