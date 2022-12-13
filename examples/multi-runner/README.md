# Action runners deployment of Multiple-Runner-Configurations-Together example

This module shows how to create GitHub action runners with multiple runner configuration together in one deployment. This example has the configurations for the following runner types with the relevant labels supported by them as matchers:

- Linux ARM64 `["self-hosted", "linux", "arm64", "amazon"]`
- Linux Ubuntu `["self-hosted", "linux", "x64", "ubuntu-latest"]` or `["self-hosted", "linux", "x64", "ubuntu-2204"]``
- Linux X64 `["self-hosted", "linux", "x64", "amazon"]`
- Windows X64 `["self-hosted", "windows", "x64", "servercore-2022"]`

The module will decide the runner for the workflow job based on the match in the labels defined in the workflow job and runner configuration. Also the runner configuration allows the match to be exact or non-exact match. We recommend to use only exact matches.

For exact match, all the labels defined in the workflow should be present in the runner configuration matchers and for non-exact match, some of the labels in the workflow, when present in runner configuration, shall be enough for the runner configuration to be used for the job. First the exact matchers are applied, next the non exact ones.

## Webhook

For the list of provided runner configurations, there will be a single webhook and only a single Github App to receive the notifications for all types of workflow triggers.

## Lambda distribution

Per combination of OS and architecture a lambda distribution syncer will be created. For this example there will be three instances (windows X64, linux X64, linux ARM).

## Usages

Steps for the full setup, such as creating a GitHub app can be found in the root module's [README](../../README.md). First download the Lambda releases from GitHub. Alternatively you can build the lambdas locally with Node or Docker, there is a simple build script in `<root>/.ci/build.sh`. In the `main.tf` you can simply remove the location of the lambda zip files, the default location will work in this case.

> Ensure you have set the version in `lambdas-download/main.tf` for running the example. The version needs to be set to a GitHub release version, see https://github.com/philips-labs/terraform-aws-github-runner/releases

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
