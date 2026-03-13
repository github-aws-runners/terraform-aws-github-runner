# Enterprise Runner Example

This example demonstrates how to deploy GitHub self-hosted runners at the **Enterprise level** using PAT-based authentication.

## Prerequisites

1. **GitHub Enterprise Account** — You need a GitHub Enterprise Cloud account with admin access.
2. **Enterprise PAT** — Create one or more Personal Access Tokens with the `manage_runners:enterprise` scope:
   - Go to your GitHub account settings → Developer settings → Personal access tokens (classic)
   - Create a new token with the `manage_runners:enterprise` scope
   - Save the token securely — you'll need it for the `enterprise_pat` variable
   - **Tip**: To distribute API calls and avoid rate limiting, create multiple PATs (from different accounts if possible) and provide them as a comma-separated string. The Lambda functions will randomly select one PAT per invocation.
3. **Enterprise Webhook** — Configure an enterprise-level webhook to send `workflow_job` events to the module's webhook endpoint. Choose a random secret for the webhook — you'll need it for the `webhook_secret` parameter.

> **Note**: Enterprise runners do **not** require a GitHub App. Only a webhook secret is needed to verify incoming webhook payloads. The PAT handles all GitHub API interactions.

## Configuration

```hcl
module "runners" {
  source = "../../"

  # Enterprise runner registration
  runner_registration_level = "enterprise"
  enterprise_slug           = "my-enterprise"

  # Enterprise PAT — stored in AWS SSM Parameter Store as SecureString
  # Single PAT:
  enterprise_pat = {
    pat = var.enterprise_pat
  }

  # Multiple PATs (comma-separated) for rate limit distribution:
  # enterprise_pat = {
  #   pat = "ghp_token1,ghp_token2,ghp_token3"
  # }

  # No GitHub App is required for enterprise runners.
  # Only the webhook_secret is needed to verify incoming webhook payloads.
  github_app = {
    webhook_secret = random_id.random.hex
  }

  # ... other configuration
}
```

## Variables

| Name | Description | Type | Required |
|------|-------------|------|----------|
| `enterprise_slug` | The slug of the GitHub Enterprise account | string | Yes |
| `enterprise_pat` | PAT with `manage_runners:enterprise` scope | string (sensitive) | Yes |
| `environment` | Environment name prefix | string | No |
| `aws_region` | AWS region for deployment | string | No |

The `github_app` block only requires `webhook_secret` — the `key_base64` and `id` fields are **not** needed for enterprise runners.

## Verification

After deployment:

1. Check the webhook endpoint in the Terraform outputs
2. Configure the enterprise webhook to point to the endpoint
3. Trigger a workflow run in any repository under the enterprise
4. Verify runners appear in **Enterprise Settings → Actions → Runners**

## Migration from Organization Runners

If you're migrating from organization-level runners:

```hcl
# Before
enable_organization_runners = true

# After
runner_registration_level = "enterprise"
enterprise_slug           = "my-enterprise"
enterprise_pat = {
  pat = var.enterprise_pat
}
```
