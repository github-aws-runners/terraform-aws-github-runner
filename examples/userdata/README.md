# Action runners deployment userdata example

The modules in the subdirectories of this example showcase how you can pass userdata to the AWS instances.

The github-runner module uses [AWS Launch Templates](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-launch-templates.html)
from which the runners are spawned. The launch template is passed the configuration script with the [user_data](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/launch_template#user_data)
argument.

If you need a lot of software installed on the runner, the pre-built AMI could be the best direction as it provides a 
performance boost since the runner software does not need to be installed on every deployment. 
[Refer to the packer scripts](https://github.com/philips-labs/terraform-aws-github-runner/tree/develop/images) 
for more information.

There are multiple ways to pass  userdata to the runners, enumerated below:

- [userdata_pre_install](https://github.com/philips-labs/terraform-aws-github-runner#input_userdata_post_install) & [userdata_post_install](https://github.com/philips-labs/terraform-aws-github-runner#input_userdata_post_install) (recommended)
- [userdata_template](https://github.com/philips-labs/terraform-aws-github-runner#input_userdata_template) (intermediate)
- [userdata_override](https://github.com/philips-labs/terraform-aws-github-runner#input_userdata_override) (advanced)

## Pre & Post Install (Recommended)
This is the recommended way to pass additional scripts to the runners using userdata.
`userdata_pre_install` is run prior to the installation and setup of the runner software, and `userdata_post_install` 
is run afterwards. 

## Template (Intermediate)
`userdata_template` can be used for intermediate use cases. It accepts *the path to a script* which will then be loaded
with [templatefile](https://www.terraform.io/language/functions/templatefile). This allows the user to reference this
module's template variables such as `${install_runner}` and `${start_runner}`

## Override (Advanced)
`userdata_override` can be used for advanced use cases. It accepts the userdata as a whole as string. Only use this option
if you know what you are doing. All template related variables in the module will be overridden, and you are fully
responsible for the setup and configuration of the runner.
