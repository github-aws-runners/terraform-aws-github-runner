# Prebuilt Images

> :warning: These images are provided as an example/

The images inside this folder are pre-built images designed to shorten the boot time of your runners and make using ephemeral runners a faster experience.

These images share the same scripting as used in the user-data mechanism in `/modules/runners/templates/`. We use a `templatefile` mechanism to insert the relevant script fragments into the scripts used for provisioning the images.

The examples in `linux-al2023` and `windows-core-2019` also upload a `start-runner` script that uses the exact same startup process as used in the user-data mechanism. This means that the image created here does not need any extra scripts injected or changes to boot up and connect to GH.

To remove old images the [AMI house keeper module](https://github-aws-runners.github.io/terraform-aws-github-runner/modules/public/ami-housekeeper/) can be used.

## Building your own

To build these images you first need to install packer.
You will also need an amazon account and to have provisioned your credentials for packer to consume.

Assuming you are building the `linux-al2023` image. Then run the following from within the `linux-al2023` folder

```bash
packer init .
packer validate .
packer build github_agent.linux.pkr.hcl
```

Your image will then begin to build inside AWS and when finished you will be provided with complete AMI.

## Using your image

To use your image in the terraform modules you will need to set some values on the module.

Assuming you have built the `linux-al2023` image which has a pre-defined AMI name in the following format `github-runner-al2023-x86_64-YYYYMMDDhhmm` you can use the following values.

```hcl
# set the name of the ami to use
ami_filter        = { name = ["github-runner-al2023-x86_64-2023*"] }
# provide the owner id of
ami_owners        = ["<your owner id>"]

enable_userdata = false
```

## Lambda MicroVM images

The `microvm-ubuntu` directory contains the Packer inputs for the Lambda MicroVM
image workflow. Unlike the AMI examples above, Lambda owns the image build.
The Packer template, Dockerfile, lifecycle-hook ZIP contract, and image
entrypoint are under `microvm-ubuntu/`; the compiled hook server is supplied
separately as a build artifact.

Apply [`examples/microvm-foundation`](../examples/microvm-foundation) first,
then follow the [`microvm-ubuntu` build instructions](microvm-ubuntu/README.md) and run
Packer with its outputs. Use the resulting image ARN in the
[`examples/microvm`](../examples/microvm) runner example.
