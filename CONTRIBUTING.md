# Contributing to this project

We'd love for you to contribute to our source code and to make this project even better than it is today! Here are the guidelines we'd like you to follow:

* [Question or Problem?](#question)
* [Issues and Bugs](#issue)
* [Feature Requests](#feature)
* [Submission Guidelines](#submit)

## <a name="question"></a> Got a Question or Problem?

If you have questions about how to use aws-github-runners, please direct these to [Discord](https://discord.gg/bxgXW8jJGh)

## <a name="issue"></a> Found an Issue?

If you find a bug in the source code or a mistake in the documentation, you can help us by submitting an issue to our [Github Repository][github]. Even better you can submit a Pull Request with a fix.

**Please see the [Submission Guidelines](#submit) below.**

## <a name="feature"></a> Want a Feature?

You can request a new feature by submitting an issue to our [Github Repository][github]. If you would like to implement a new feature then consider what kind of change it is:

* **Major Changes** that you wish to contribute to the project should be discussed first on our [Slack group][slack] so that we can better coordinate our efforts, prevent duplication of work, and help you to craft the change so that it is successfully accepted into the project.
* **Small Changes** can be crafted and submitted to the [Github Repository][github] as a Pull Request.

## <a name="docs"></a> Want a Doc Fix?

If you want to help improve the docs, it's a good idea to let others know what you're working on to minimize duplication of effort. Create a new issue (or comment on a related existing one) to let others know what you're working on.

For large fixes, please build and test the documentation before submitting the MR to be sure you haven't accidentally introduced any layout or formatting issues. You should also make sure that your commit message starts with "docs" and follows the **[Commit Message Guidelines](#commit)** outlined below.

## <a name="submit"></a> Submission Guidelines

### Submitting an Issue

Before you submit your issue search the archive, maybe your question was already answered.

If your issue appears to be a bug, and hasn't been reported, open a new issue. Help us to maximize the effort we can spend fixing issues and adding new features, by not reporting duplicate issues. Providing the following information will increase the chances of your issue being dealt with quickly:

* **Overview of the Issue** - if an error is being thrown a non-minified stack trace helps
* **Motivation for or Use Case** - explain why this is a bug for you
* **Project Version(s)** - is it a regression?
* **Reproduce the Error** - try to describe how to reproduce the error
* **Related Issues** - has a similar issue been reported before?
* **Suggest a Fix** - if you can't fix the bug yourself, perhaps you can point to what might be
  causing the problem (line of code or commit)

**If you get help, help others. Good karma rulez!**

### Submitting a Pull Request

Before you submit your pull request consider the following guidelines:

* Make your changes in a new git branch:

    ```shell
    git checkout -b my-fix-branch main
    ```

* Create your patch, **including appropriate test cases**.
* Install [Terraform](https://www.terraform.io/). We lock the version with [tfenv](https://github.com/tfutils/tfenv), check `required_version` in `versions.tf` for the current development version of the module.
* Install [pre-commit hooks](https://pre-commit.com/). The hooks runs some basic checks. The commit will run the hooks, you can invoke the hooks manually `pre-commit run --all-files` as well. The hooks require tflint to be installed and terraform modules to be initialized.
    * Install [tflint](https://github.com/terraform-linters/tflint). We use tflint to lint the terraform code.
    * Initialize the terraform modules:

        ```shell
        terraform init
        ```

* Commit your changes using a descriptive commit message:

    ```shell
    git commit -a
    ```

  Note: the optional commit `-a` command line option will automatically "add" and "rm" edited files.

* Install [node](https://nodejs.org/en/) and [yarn](https://yarnpkg.com/). We use yarn to lint, test and build the lambdas.
* Build your changes locally to ensure all the tests pass:

        ```shell
        cd lambdas
        yarn install
        yarn format
        yarn lint
        yarn test
        yarn build
        cd ..
        ```

* Push your branch to Github:

    ```shell
    git push origin my-fix-branch
    ```

In Github, send a pull request to original main branch: f.e. `terraform-aws-github-runner:main`.
If we suggest changes, then:

* Make the required updates.
* Re-run the test suite to ensure tests are still passing.
* Commit your changes to your branch (e.g. `my-fix-branch`).
* Push the changes to your Github repository (this will update your Pull Request).

If the PR gets too outdated we may ask you to rebase and force push to update the PR:

```shell
git rebase main -i
git push origin my-fix-branch -f
```

_WARNING: Squashing or reverting commits and force-pushing thereafter may remove Github comments on code that were previously made by you or others in your commits. Avoid any form of rebasing unless necessary.

That's it! Thank you for your contribution!

#### After your merge request is merged

After your pull request is merged, you can safely delete your branch and pull the changes
from the main (upstream) repository:

* Delete the remote branch on Github either through the Github web UI or your local shell as follows:

    ```shell
    git push origin --delete my-fix-branch
    ```

* Check out the main branch:

    ```shell
    git checkout main -f
    ```

* Delete the local branch:

    ```shell
    git branch -D my-fix-branch
    ```

* Update your main with the latest upstream version:

    ```shell
    git pull --ff upstream main
    ```


[contribute]: CONTRIBUTING.md
[github]: https://github.com/github-aws-runners/terraform-aws-github-runner/issues
