import { SSM } from '@aws-sdk/client-ssm';

export async function getParameterValue(parameter_name: string): Promise<string> {
  const client = new SSM({ region: process.env.AWS_REGION });
  return (await client.getParameter({ Name: parameter_name, WithDecryption: true })).Parameter?.Value as string;
}
