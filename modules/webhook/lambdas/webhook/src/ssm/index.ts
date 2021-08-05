import { SSM } from '@aws-sdk/client-ssm';

export async function getParameterValue(environment: string, name: string): Promise<string> {
  const parameter_name = `/actions_runner/${environment}/${name}`;
  const client = new SSM({ region: process.env.AWS_REGION as string });
  return (await client.getParameter({ Name: parameter_name, WithDecryption: true })).Parameter?.Value as string;
}
