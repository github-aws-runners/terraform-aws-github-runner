# Agent for orchestration of action runners

Agent to orchestrate the the action runners are composed of:

- API Gatewway and lambda to receive GitHub events
- Lambda to create EC2 action runner instances based queue events and limits.
