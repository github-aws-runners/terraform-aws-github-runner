# Action runners deployment of Multiple-Runner-Configurations-Together example

This module shows how to create GitHub action runners with multiple runner configuration together in one deployment.
This example has the configurations for the following runner types with the relevant labels supported by them as matchers:
- Linux ARM64 (["self-hosted", "linux", "arm64", "arm"])
- Linux Ubuntu (["self-hosted", "linux", "x64", "ubuntu"])
- Linux X64 (["self-hosted", "linux", "x64", "amazon"])

The module will decide the runner for the workflow job based on the match in the labels defined in the workflow job and runner configuration. Also the runner configuration allows the match to be exact or non-exact match.

For exact match, all the labels defined in the workflow should be present in the runner configuration matchers and for non-exact match, some of the labels in the workflow, when present in runner configuration, shall be enough for the runner configuration to be used for the job.

The workflow jobs are matched against the runner configurationn in the order in which they are provided in the configuration. Hence, for all provided runner configurations, its necessary to order them from most-precise match to least-precise match. For example:

Available configurations
- Linux Ubuntu
- Linux x64

Its important to keep the specific configuration (Linux Ubuntu) before the generic configuration (Linux x64) in order to let the workflow find the specific configuration first if the workflow demands specific configuration.

## Webhook
For the list of provided runner configurations, there will be a single webhook and only a single Github app to receive the notifications for all types of workflow triggers.

## Lambda distribution
Lambda distribution for all the lambda's will be downloaded from GitHub.

## Usages

Steps for the full setup, such as creating a GitHub app can be found in the root module's [README](../../README.md). First download the Lambda releases from GitHub. Alternatively you can build the lambdas locally with Node or Docker, there is a simple build script in `<root>/.ci/build.sh`. In the `main.tf` you can simply remove the location of the lambda zip files, the default location will work in this case.

> Ensure you have set the version in `lambdas-download/main.tf` for running the example. The version needs to be set to a GitHub release version, see https://github.com/philips-labs/terraform-aws-github-runner/releases

```bash
cd lambdas-download
terraform init
terraform apply
cd ..
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
