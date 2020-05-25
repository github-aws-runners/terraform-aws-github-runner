# Action runners deployed with permissions boundary

This modules shows how to create GitHub action runners with permissions boundaries and paths used in role, policies, and instance profiles.

## Usages

Steps for the full setup, such as creating a GitHub app can be find the module [README](../../README.md). First create the deploy role and boundary policies. This steps required an admin user.

```bash
cd setup
terraform init
terraform apply
cd ..
```

Now a new role and policies should be created. The output of the previous step is imported in this workspace to load the role and policy. The deployment of the runner module assumes the new role before creating all resources (https://www.terraform.io/docs/providers/aws/index.html#assume-role). Before running Terraform, ensure the GitHub app is configured.

Download the lambda releases.

```bash
cd lambdas-download
terraform init
terraform apply
cd ..
```

Now you can deploy the module.

```bash
terraform init
terraform apply
```
