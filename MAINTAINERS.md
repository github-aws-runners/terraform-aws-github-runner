# Maintainers guide

Roles and responsibilities of the maintainers of the project. For the full governance model — including how decisions are made, how roles are assigned, and how maintainers can step down or be removed — see [GOVERNANCE.md](GOVERNANCE.md).

## Collaborators

Collaborators are contributors who have shown sustained interest in the project and have been invited to take a more active role. See [GOVERNANCE.md](GOVERNANCE.md) for details on the path from contributor to collaborator to maintainer.

If you are interested in becoming a collaborator or maintainer, open a pull request to add yourself to this file. The existing maintainers will use that PR as a place for a joint discussion on whether the timing is right.

| Name | GitHub Handle | Affiliation |
| ---- | ------------- | ----------- |
| -    | -             | -           |

## Maintainers

| Name              | GitHub Handle       | Affiliation  |
| ----------------- | ------------------- | ------------ |
| Niek Palm         | [@npalm]            | Philips      |
| Koen de Laat      | [@koendelaat]       | Philips      |
| Guilherme Caulada | [@guicaulada]       | Grafana Labs |
| Ederson Brilhante | [@edersonbrilhante] | Cisco        |
| Brend Smits       | [@Brend-Smits]      | Philips      |
| Stuart Pearson    | [@stuartp44]        | Philips      |

## Responsibilities

### Pull Requests

Maintainers are responsible to review and merge pull requests. Currently we have no end-to-end automation to test a pull request. Here a short guide how to review a pull request.

#### Guidelines

- A pull request can be merged once it has **at least one maintainer approval**, provided no other maintainer has explicitly requested changes.
- **Maintainers from the same company must not be the sole approver of each other's pull requests.** At least one approval from a maintainer at a different organisation is required before such a PR can be merged.
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
