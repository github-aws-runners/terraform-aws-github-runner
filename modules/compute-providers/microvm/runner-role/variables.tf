variable "trust_services" {
  description = "Service principals trusted to assume and tag MicroVM runner-role sessions."
  type        = list(string)
}
