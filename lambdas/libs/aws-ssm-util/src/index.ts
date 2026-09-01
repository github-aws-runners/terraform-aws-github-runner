import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { PutParameterCommand, SSMClient, Tag } from '@aws-sdk/client-ssm';
import { getTracedAWSV3Client } from '@aws-github-runner/aws-powertools-util';
import { SecretsProvider } from '@aws-lambda-powertools/parameters/secrets';
import { SSMProvider } from '@aws-lambda-powertools/parameters/ssm';

// A parameter name of the form `<secret arn>#<jsonKey>` (or just `<secret arn>`) points at
// Secrets Manager instead of SSM. ARNs cannot contain '#', so splitting on the first one is safe.
const SECRETS_MANAGER_ARN_REGEX = /^arn:[^:]*:secretsmanager:/;

export async function getParameter(parameter_name: string): Promise<string> {
  if (SECRETS_MANAGER_ARN_REGEX.test(parameter_name)) {
    return getSecretsManagerParameter(parameter_name);
  }

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

async function getSecretsManagerParameter(reference: string): Promise<string> {
  const hashIndex = reference.indexOf('#');
  const secretArn = hashIndex === -1 ? reference : reference.substring(0, hashIndex);
  const jsonKey = hashIndex === -1 ? undefined : reference.substring(hashIndex + 1);

  const secretsManagerClient = getTracedAWSV3Client(new SecretsManagerClient({ region: process.env.AWS_REGION }));
  const client = new SecretsProvider({ awsSdkV3Client: secretsManagerClient });
  const result = await client.get(secretArn, {
    maxAge: 30, // 30 seconds override default 5 seconds
  });

  if (!result) {
    throw new Error(`Secret ${secretArn} not found`);
  }

  if (jsonKey === undefined) {
    return result as string;
  }

  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(result as string);
  } catch {
    throw new Error(`Secret ${secretArn} is not valid JSON, cannot read key "${jsonKey}"`);
  }

  if (typeof parsedValue !== 'object' || parsedValue === null) {
    throw new Error(`Secret ${secretArn} is not a JSON object, cannot read key "${jsonKey}"`);
  }

  const value = (parsedValue as Record<string, unknown>)[jsonKey];
  if (value === null || value === undefined) {
    throw new Error(`Key "${jsonKey}" not found in secret ${secretArn}`);
  }

  return String(value);
}

export const SSM_ADVANCED_TIER_THRESHOLD = 4000;

export async function putParameter(
  parameter_name: string,
  parameter_value: string,
  secure: boolean,
  options: { tags?: Tag[] } = {},
): Promise<void> {
  const client = getTracedAWSV3Client(new SSMClient({ region: process.env.AWS_REGION }));

  // Determine tier based on parameter_value size
  const valueSizeBytes = Buffer.byteLength(parameter_value, 'utf8');

  await client.send(
    new PutParameterCommand({
      Name: parameter_name,
      Value: parameter_value,
      Type: secure ? 'SecureString' : 'String',
      Tags: options.tags,
      Tier: valueSizeBytes >= SSM_ADVANCED_TIER_THRESHOLD ? 'Advanced' : 'Standard',
    }),
  );
}
