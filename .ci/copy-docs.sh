#!/usr/bin/env bash

# function to copy for all subdirs on the first level the README.md file to the target dir and rename the file to name of the dir
# also inject a line on the top of the file <!-- This file is generated. Do not edit! -->
# and exclude the base dir as well the exclsuion list
#
# $1 source dir
# $2 target directory
# $3 list of directories to exclude
function copy_readme {
  mkdir -p $2
  for dir in $(find $1 -mindepth 1 -maxdepth 1 -type d); do
    # ignore dirs in in the exclusion list (comma seprated listed)
    if [[ "$3" == *$(basename $dir)* ]]; then
      echo IGNORE $dir
      continue
    fi

    # Check if the subdirectory exists in Git
    if git rev-parse --is-inside-work-tree &>/dev/null && git ls-files --error-unmatch "$dir" &>/dev/null; then
      echo "Copying README.md from ${dir} to $2"
      pushd "$dir" >/dev/null
      cp README.md ../../$2/$(basename $dir).md

      # inject the folloing comment on the top <!-- This file is generated. Do not edit! PLEASE edit https://github.com/philips-labs/terraform-aws-github-runner/blob/main/$dir/README.md -->
      sed -i "1s;^;<!-- This file is generated. Do not edit! PLEASE edit https://github.com/philips-labs/terraform-aws-github-runner/blob/main/$dir/README.md -->\n;" ../../$2/$(basename $dir).md
      popd >/dev/null
    fi
  done
}


# copy for all subdirs in examples the READM.md file to the docs directory and replace the filename by the name of the dir with extension md

copy_readme examples docs/generated/examples "examples/base"
copy_readme modules docs/generated/modules/internal "multi-runner,ami-housekeeper,download-lambda,setup-iam-permissions,"
copy_readme modules docs/generated/modules/public "webhook,runner-binaries-syncer,runners,ssm,webhook-github-app"


  # for dir in $(find examples -mindepth 1 -maxdepth 1 -type d); do
  #   # ignore dirs that are contained in $1
  #   if [[ "$1" == *$(basename $dir)* ]]; then
  #     echo MATCH
  #     continue
  #   fi
  #   echo no match $dir
  # done


# for dir in $(find examples -mindepth 1 -maxdepth 2 -type d); do
#   # ignore dir base
#   if [[ "$dir" == "examples/base" ]]; then
#     continue
#   fi
#   # Check if the subdirectory exists in Git
#   if git rev-parse --is-inside-work-tree &>/dev/null && git ls-files --error-unmatch "$dir" &>/dev/null; then
#     echo "Copying README.md from ${dir} to docs"
#     pushd "$dir" >/dev/null
#     cp README.md ../../docs/examples/$(basename $dir).md

#     # inject the folloing comment on the top <!-- This file is generated. Do not edit! -->
#     sed -i '1s;^;<!-- This file is generated. Do not edit! -->\n;' ../../docs/examples/$(basename $dir).md
#     popd >/dev/null
#   fi
# done

