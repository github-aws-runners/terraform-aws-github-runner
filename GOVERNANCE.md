# Governance Model

This document describes the governance model for the **terraform-aws-github-runner** project. It defines how decisions are made, how contributors can grow their involvement, and what is expected of maintainers.

## Communication

### Public Discussion

The primary place for community discussion is **GitHub** — issues and pull requests are the preferred venue for bug reports, feature proposals, and design conversations. This keeps decisions transparent and discoverable.

For more informal discussion, questions, and real-time conversation, we also have a [Discord](https://discord.gg/bxgXW8jJGh) server. All contributors and users are welcome to join.

### Maintainer Discussion

Maintainers have a private channel on Discord to discuss sensitive topics, such as security issues, onboarding new maintainers, and matters that are not yet ready for public discussion. Decisions reached in the private channel are communicated back to the community once they are ready.

## Roles

### Contributor

Anyone who opens an issue, submits a pull request, or participates in discussion is a contributor. No special access is required.

### Collaborator

Contributors who have shown sustained interest in the project may be invited as **collaborators** on the GitHub repository. Collaborators can be assigned to issues and pull requests and are expected to participate actively in reviews and discussions. This role is a stepping stone toward becoming a maintainer.

If you are interested in becoming a collaborator or maintainer, you can express this by opening a pull request to add yourself to [MAINTAINERS.md](MAINTAINERS.md).

### Maintainer

Collaborators who have demonstrated trustworthiness, good judgement, and a thorough understanding of the project may be promoted to **maintainer**. Maintainers can approve and merge pull requests and have commit access to the repository.

The current maintainers are listed in [MAINTAINERS.md](MAINTAINERS.md).

#### Becoming a Maintainer

The path to maintainership is:

1. Contribute code, documentation, or reviews over a sustained period.
2. Be invited as a collaborator by an existing maintainer.
3. Continue demonstrating good judgement and reliability.
4. Be proposed and agreed upon by the existing maintainers (via the private Discord channel).
5. Be added to [MAINTAINERS.md](MAINTAINERS.md) and granted merge permissions.

There is no fixed timeline; promotion is based on demonstrated trust and engagement.

#### Stepping Down or Being Removed

Maintainers who are no longer able to actively contribute are encouraged to step down. They can do so at any time by opening a pull request to remove themselves from [MAINTAINERS.md](MAINTAINERS.md) or by notifying another maintainer directly.

If the maintainers collectively notice a prolonged absence or lack of engagement from a maintainer, they may reach out to check in. If no response is received or the maintainer confirms they are no longer able to contribute, they may be removed from [MAINTAINERS.md](MAINTAINERS.md) by a pull request approved by the remaining maintainers. This is not a punitive measure — it is done to keep the list accurate and the project healthy.

## Decision Making

Most changes are discussed openly via GitHub issues and pull requests, with consensus reached through review comments. For larger design decisions, the Discord community is the primary forum.

Maintainers make final decisions on pull request merges. Where there is disagreement among maintainers, the discussion moves to the Discord channel to reach a resolution.

### Pull Request Approval Policy

- A pull request can be merged once it has received **at least one maintainer approval**, provided no other maintainer has explicitly requested changes.
- To avoid the equivalent of checking your own homework, **maintainers from the same company must not be the sole approver of each other's pull requests**. At least one approval from a maintainer at a different organisation is required before such a PR can be merged.

## Testing Requirements

At this time, maintainers are expected to have access to their own AWS account for manual and exploratory testing of pull requests. We recognise this is a barrier and are actively exploring options for a sponsored or shared AWS environment to make contributions and automated testing more accessible. If you are aware of or able to provide such sponsorship, please reach out via Discord or open an issue.

## Changes to This Document

Changes to this governance model should be proposed via a pull request and require approval from at least two maintainers.
