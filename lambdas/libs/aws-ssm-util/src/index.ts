import { getTracedAWSV3Client } from '@aws-github-runner/aws-powertools-util';
import { SSMProvider } from '@aws-lambda-powertools/parameters/ssm';
import { GetParametersByPathCommand, PutParameterCommand, SSMClient, type Tag } from '@aws-sdk/client-ssm';

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

export const SSM_ADVANCED_TIER_THRESHOLD = 4000;

/**
 * Retrieve all SSM parameters under a given path.
 *
 * @remarks
 * - Always requests decrypted values (`WithDecryption: true`).
 * - Supports automatic pagination when the result spans multiple pages.
 *
 * @param parameter_path - Exact SSM path prefix (including leading slash).
 * @param options.recursive - When true, recurse into all nested paths.
 * @returns Map of parameter name to value for every parameter found beneath the path.
 */
export async function getParametersByPath(
  parameter_path: string,
  options: { recursive?: boolean } = {},
): Promise<Record<string, string>> {
  if (!parameter_path) {
    return {};
  }

  const ssmClient = getTracedAWSV3Client(new SSMClient({ region: process.env.AWS_REGION }));
  const parameters = <Record<string, string>>{};
  let nextToken: string | undefined;

  do {
    const response = await ssmClient.send(
      new GetParametersByPathCommand({
        Path: parameter_path,
        Recursive: options.recursive ?? false,
        WithDecryption: true,
        NextToken: nextToken,
      }),
    );

    for (const parameter of response.Parameters ?? []) {
      if (!parameter.Name || parameter.Value === undefined) {
        continue;
      }

      parameters[parameter.Name] = parameter.Value;
    }

    nextToken = response.NextToken;
  } while (nextToken);

  return parameters;
}

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
