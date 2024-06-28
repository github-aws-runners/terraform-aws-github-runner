import { GetParameterCommand, PutParameterCommand, SSMClient, Tag } from '@aws-sdk/client-ssm';
import { getTracedAWSV3Client } from '@terraform-aws-github-runner/aws-powertools-util';

export async function getParameter(parameter_name: string): Promise<string> {
  const client = getTracedAWSV3Client(new SSMClient({ region: process.env.AWS_REGION }));
  return (await client.send(new GetParameterCommand({ Name: parameter_name, WithDecryption: true }))).Parameter
    ?.Value as string;
}

export async function putParameter(
  parameter_name: string,
  parameter_value: string,
  secure: boolean,
  options: { tags?: Tag[] } = {},
): Promise<void> {
  const client = getTracedAWSV3Client(new SSMClient({ region: process.env.AWS_REGION }));
  await client.send(
    new PutParameterCommand({
      Name: parameter_name,
      Value: parameter_value,
      Type: secure ? 'SecureString' : 'String',
      Tags: options.tags,
    }),
  );
}
