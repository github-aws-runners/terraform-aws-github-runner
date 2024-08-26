import { PutParameterCommand, SSMClient, Tag } from '@aws-sdk/client-ssm';
import { getTracedAWSV3Client } from '@terraform-aws-github-runner/aws-powertools-util';
import { SSMProvider } from '@aws-lambda-powertools/parameters/ssm';

export async function getParameter(parameter_name: string): Promise<string> {
  const ssmClient = getTracedAWSV3Client(new SSMClient({ region: process.env.AWS_REGION }));
  const client = new SSMProvider({ awsSdkV3Client: ssmClient }); //getTracedAWSV3Client();
  const result = await client.get(parameter_name, {
    decrypt: true,
    maxAge: 30, // 30 seconds override default 5 seconds
  });

  // throw error if result is undefined
  if (!result) {
    throw new Error(`Parameter ${parameter_name} not found`);
  }
  return result;
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
