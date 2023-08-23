download-lambdas-apply:
	cd modules/download-lambda && terraform apply -var-file=lambdas.tfvars -auto-approve

download-lambdas-init:
	cd modules/download-lambda && terraform init

download-lambdas:
	make download-lambdas-init
	make download-lambdas-apply

runner-module-init:
	terraform init

runner-module-apply:
	terraform apply -var-file=github-runners.tfvars -var="vpc_id=${VPC_ID}" -var="subnet_ids=[\"${SUBNET_ID}\"]" -var="github_app={\"key_base64\"=\"${GITHUB_APP_PRIVATE_KEY_BASE64}\",\"id\"=\"379720\",\"webhook_secret\":\"Iv1.27a7b4e59a038b5e\"}" -auto-approve

github-runners:
	make runner-module-init
	make runner-module-apply

up:
	make download-lambdas
	make github-runners
