import { GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

export async function getParameter(parameter_name: string): Promise<string> {
  const client = new SSMClient({ region: process.env.AWS_REGION });
  return (await client.send(new GetParameterCommand({ Name: parameter_name, WithDecryption: true }))).Parameter
    ?.Value as string;
}

export async function putParameter(parameter_name: string, parameter_value: string, secure: boolean): Promise<void> {
  const client = new SSMClient({ region: process.env.AWS_REGION });
  await client.send(
    new PutParameterCommand({
      Name: parameter_name,
      Value: parameter_value,
      Type: secure ? 'SecureString' : 'String',
    }),
  );
}
