#!/usr/bin/env bash

# This script will run terraform init in all subdirectories of the examples directory
# required to run tflint via pre-commit

# only run the script if a uniique pid file exits if not creat it or --force flag is passed
pid="/tmp/github-aws-runners-terraform-aws-github-runner.pid"
if [ "$1" == "--force" ]; then
  rm -f /tmp/github-aws-runners-terraform-aws-github-runner.pid
fi

if [ ! -f $pid ]; then
  echo $$ > $pid
else
  echo "Init all terraform directories will be skipped. To run the script remove the file $pid or run with --force"
  exit 0
fi

# Change to the examples directory
example_dirs=$(find examples -mindepth 1 -maxdepth 2 -type d | grep -v "templates")
module_dirs=$(find modules -mindepth 1 -maxdepth 2 -type d | grep -v "templates")

# merge example_dirs and module_dirs in terraform_dirs
terraform_dirs=$(echo $example_dirs $module_dirs "modules/runners/pool" | tr " " "\n" | sort -u | tr "\n" " ")

for dir in $terraform_dirs; do
  # Check if the subdirectory exists in Git
  if git rev-parse --is-inside-work-tree &>/dev/null && git ls-files --error-unmatch "$dir" &>/dev/null; then
    echo "Running terraform init in ${dir} - supressing output"
    pushd "$dir" >/dev/null
    terraform init -lockfile=readonly -backend=false &>/dev/null || true
    popd >/dev/null
  fi
done
