resource "time_rotating" "rotation_days" {
  rotation_days = var.rotation_days
}

resource "random_id" "random" {
  byte_length = 20
  keepers = {
    rotation = time_rotating.rotation_days.id
  }
}
