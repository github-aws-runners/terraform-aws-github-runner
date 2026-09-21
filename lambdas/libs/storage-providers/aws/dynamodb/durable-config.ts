import { GetItemCommand } from '@aws-sdk/client-dynamodb';

import { getDynamoDbClient } from './client';
import { ID_ATTRIBUTE, SCOPE_ATTRIBUTE, VALUE_ATTRIBUTE } from './keys';

export async function getDurableConfigValue(
  tableName: string,
  scope: string,
  id: string,
  description: string,
): Promise<string> {
  const result = await getDynamoDbClient().send(
    new GetItemCommand({
      TableName: tableName,
      Key: {
        [SCOPE_ATTRIBUTE]: { S: scope },
        [ID_ATTRIBUTE]: { S: id },
      },
      ConsistentRead: true,
      ProjectionExpression: '#value',
      ExpressionAttributeNames: {
        '#value': VALUE_ATTRIBUTE,
      },
    }),
  );

  if (!result.Item) {
    throw new Error(`${description} item '${scope}/${id}' was not found`);
  }

  const value = result.Item[VALUE_ATTRIBUTE]?.S;
  if (value === undefined) {
    throw new Error(`${description} item '${scope}/${id}' does not contain a string value`);
  }

  return value;
}
