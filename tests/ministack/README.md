# MiniStack apply test

This fixture applies the `ssm`, `setup-iam-permissions`, and `lambda` modules
against [MiniStack](https://github.com/ministackorg/ministack). It exercises
real AWS provider create, read, and delete calls without an AWS account.

The fixture configures synthetic credentials in the AWS provider, and the
GitHub Actions workflow routes every AWS service to the `ministack` service
container. For a local run, start MiniStack on port 4566 and set the global AWS
endpoint before running Terraform:

```shell
docker run --detach --rm --name terraform-aws-github-runner-ministack \
  --publish 127.0.0.1:4566:4566 \
  --env MINISTACK_ACCOUNT_ID=000000000000 \
  --env MINISTACK_REGION=eu-west-1 \
  ghcr.io/ministackorg/ministack:1.5.0@sha256:ba48c20747780605a4287a950e7bb1758ddc3b55ec92409a0c47677cbe26bbb9

curl --fail --retry 10 --retry-connrefused --retry-delay 1 \
  http://127.0.0.1:4566/_ministack/health

export AWS_ENDPOINT_URL=http://127.0.0.1:4566
export AWS_REGION=eu-west-1
export AWS_EC2_METADATA_DISABLED=true

terraform init -backend=false -input=false
terraform apply -auto-approve -input=false
terraform destroy -auto-approve -input=false
docker stop terraform-aws-github-runner-ministack
```

Run the Terraform commands from this directory. The endpoint input only accepts
the loopback addresses used locally and the service hostname used in CI. The
provider also ignores ambient AWS credentials, and `AWS_ENDPOINT_URL` catches
any AWS service added to the fixture in the future.

This test covers AWS provider and module API compatibility. MiniStack runs with
authorization disabled, so it does not validate IAM policy enforcement, real
KMS encryption, Lambda execution, or AWS service limits.
