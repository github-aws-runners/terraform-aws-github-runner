variable "config" {
  type = object({
    prefix = string
    tags = map(string)
  })
}
