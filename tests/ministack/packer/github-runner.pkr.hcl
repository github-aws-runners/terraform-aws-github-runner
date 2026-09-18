// MiniStack cannot boot a guest for the amazon-ebs builder. This test target
// keeps the Packer build boundary while delegating AMI metadata registration to
// the MiniStack EC2 API through the shell-local provisioner.

variable "endpoint_url" {
  description = "MiniStack endpoint used by the fixture registration script."
  type        = string
  default     = "http://localhost:4566"
}

variable "region" {
  description = "AWS region used by MiniStack."
  type        = string
  default     = "eu-west-1"
}

variable "image_name" {
  description = "AMI name that the Terraform example will discover."
  type        = string
}

variable "architecture" {
  description = "AMI architecture registered in MiniStack."
  type        = string
  default     = "x86_64"
  validation {
    condition     = contains(["arm64", "x86_64"], var.architecture)
    error_message = "Architecture must be arm64 or x86_64."
  }
}

variable "image_location" {
  description = "Test-only image location stored in the MiniStack AMI metadata."
  type        = string
  default     = "alpine:3.20"
}

variable "created_image_id_file" {
  description = "File where the registration script records an image created by this build."
  type        = string
}

source "null" "ministack_ami" {
  communicator = "none"
}

build {
  name = "ministack-ami"
  sources = [
    "source.null.ministack_ami"
  ]

  provisioner "shell-local" {
    environment_vars = [
      "MINISTACK_ENDPOINT_URL=${var.endpoint_url}",
      "MINISTACK_REGION=${var.region}",
      "MINISTACK_IMAGE_NAME=${var.image_name}",
      "MINISTACK_IMAGE_ARCHITECTURE=${var.architecture}",
      "MINISTACK_IMAGE_LOCATION=${var.image_location}",
      "MINISTACK_CREATED_IMAGE_ID_FILE=${var.created_image_id_file}",
    ]
    script = "${path.root}/register-image.sh"
  }
}
