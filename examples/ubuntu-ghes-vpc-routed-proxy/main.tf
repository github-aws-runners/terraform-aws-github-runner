
module "runners" {
  source = "../../"

  # Defining a 'secret.tfvars' file or fill TF_VAR_xxx sysenv would be better for sensivite data (including proxy definition) !
  github_app = {
    id             = 42
    key_base64     = "HEX...KEY="
    webhook_secret = "foobar"
  }

  aws_region = "eu-west-3"

  # HTTP proxy used by lambdas scale up/down runners to connect to AWS API (due to be in a routed VPC which has no direct internet access). Will be usable in 'userdata_template' if needed
  http_proxy = "http://foo:bar@proxy.company.com:80"

  # Routed VPC and associated subnets for lambdas scale up/down runners
  vpc_id            = "vpc-abcd2345"
  subnet_ids        = ["subnet-1ab23c45", "subnet-2bc34d56", "subnet-3cd45e57"]
  lambda_subnet_ids = ["subnet-1ab23c45", "subnet-2bc34d56", "subnet-3cd45e57"]

  # Security group associated to you routed VPC, used by lambdas scale up/down runners
  lambda_security_group_ids = ["sg-1ab2c342"]

  # Custom user datas in charge to configure GitHub action runner (and install it if not in AMI)
  userdata_template = "./templates/user-data.sh"

  # On-demand instances instead of spot instances
  market_options= null
  
  # Enable runner at organization level, even if used at enterprise level (currently hardcoded in 'userdata_template') 
  enable_organization_runners = true
  
  # GHES endpoint, on-premise or in routed VPC
  ghes_url = "https://github.company.com"
  
  # If GHES is hosted with custom (chain) certificate, hard to deploy it into lambdas scale up/down runners => useful in some case (but evil!)
  ghes_ssl_verify = false
  
  # Create a GitHub token which can be used to link runner at enterprise level
  # Waiting 'Runner at Enterprise level implemented properly with SSM', tips for passing company id ("stafftools > Enterprise Overview") and admin PAT to user-data
  userdata_pre_install  = "my-company"
  userdata_post_install = "ghp_QAbcdefghijklmnopqrstuvwxy123456789Z"

  runner_extra_labels = "ubuntu,ubuntu-latest,ubuntu-20.04"

  # The AMI which contains all setup tools installed (Docker, Node, ...), including company regstries configurations, etc
  # The only tasks is to configure and run (optionally install it) GitHub runner to link with GHES
  ami_owners = ["123456789042"]
  ami_filter = {
    name = ["github-runners-ami"]
  }
  instance_types = ["t3.medium"]
  # EC2 VM security group, for SSH acces from intranet if needed, could be the same as 'lambda_security_group_ids'
  runner_additional_security_group_ids = ["sg-1ab2c342"] 
  key_name = "github-runners-vm"
  block_device_mappings = {
    device_name = "/dev/sda1"
    volume_size = 40
    encrypted = false
    delete_on_termination = true
  }    

  environment = "github-runners-demo"
  tags = {
    Cost = "github-runners-demo"
  }

  webhook_lambda_zip                = "lambdas-download/webhook.zip"
  runner_binaries_syncer_lambda_zip = "lambdas-download/runner-binaries-syncer.zip"
  runners_lambda_zip                = "lambdas-download/runners.zip"

}