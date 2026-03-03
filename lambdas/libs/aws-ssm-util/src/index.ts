import { GetParametersCommand, PutParameterCommand, SSMClient, Tag } from '@aws-sdk/client-ssm';
import { getTracedAWSV3Client } from '@aws-github-runner/aws-powertools-util';
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

/**
 * Retrieves multiple parameters from AWS Systems Manager Parameter Store.
 *
 * This function uses the AWS SSM {@link GetParametersCommand} API to fetch the values
 * for the provided parameter names. Requests are automatically chunked into batches
 * of up to 10 names per call to comply with the AWS GetParameters API limit.
 *
 * Each successfully retrieved parameter is added to the returned {@link Map}, where:
 * - The map key is the full parameter name as stored in Parameter Store.
 * - The map value is the decrypted string value of the parameter.
 *
 * Parameter names that are not found in Parameter Store (or that cannot be returned
 * by the API) are silently omitted from the resulting map. They will not appear as
 * keys in the returned {@link Map}.
 *
 * @param parameter_names - An array of parameter names to retrieve from SSM Parameter Store.
 *   If the array is empty, an empty {@link Map} is returned without calling the AWS API.
 *
 * @returns A {@link Map} where each key is a parameter name and each value is the
 *   corresponding decrypted string value for that parameter. Only parameters that
 *   are successfully retrieved and have both a `Name` and a `Value` are included.
 *
 * @throws Error Propagates any error thrown by the underlying AWS SDK client,
 *   such as network errors, AWS service errors (e.g., access denied, throttling),
 *   or configuration issues (e.g., missing region or credentials).
 */
export async function getParameters(parameter_names: string[]): Promise<Map<string, string>> {
  if (parameter_names.length === 0) {
    return new Map();
  }

  const ssmClient = getTracedAWSV3Client(new SSMClient({ region: process.env.AWS_REGION }));
  const result = new Map<string, string>();

  // AWS SSM GetParameters API has a limit of 10 parameters per call
  const chunkSize = 10;
  for (let i = 0; i < parameter_names.length; i += chunkSize) {
    const chunk = parameter_names.slice(i, i + chunkSize);
    const response = await ssmClient.send(
      new GetParametersCommand({
        Names: chunk,
        WithDecryption: true,
      }),
    );

    for (const param of response.Parameters ?? []) {
      if (param.Name && param.Value) {
        result.set(param.Name, param.Value);
      }
    }
  }

  return result;
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
