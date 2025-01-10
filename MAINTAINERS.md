# Maintainers guide

Roles and responsibilities of the maintainers of the project.

## Maintainers

| Name         | GitHub        | Affiliation |
| ------------ | ------------- | ----------- |
| Niek Palm    | [@npalm]      | Philips     |
| Koen de Laat | [@koendelaat] | Philips     |

## Responsibilities

### Pull Requests

Maintainers are responsible to review and merge pull requests. Currently we have no end-to-end automation to test a pull request. Here a short guide how to review a pull request.

#### Guidelines

- Check if changes are implemented for both modules (root and multi-runner)
- Check backwards compatibility, we strive to keep the module compatible with previous versions
- Check complexity of the changes, if the changes are too complex. Think about how does impact the PR on the long term maintaining the module.
- Check all pipelines are passing, if not request the author to fix the issues
- In case any new dependency is added ensure we can trust and rely on the dependency. Make explicit comments in the PR that the dependency is safe to use.

#### Test

The following steps needs to be applied to test a PR

1. Check to which deployment scenario the PR belongs to: "single runner (default example)" or "multi runner"
2. Deploy per scenario the main branch
3. Apply the PR to the deployment. Check output for breaking changes such as destroying resources containing state.
4. Test the PR by running a workflow

### Security

Act on security issues as soon as possible. If a security issue is reported.
