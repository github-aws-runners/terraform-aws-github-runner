import { logger, setContext } from '@aws-github-runner/aws-powertools-util';
import { BlockList } from 'net';
import { APIGatewayRequestAuthorizerEventV2 } from 'aws-lambda/trigger/api-gateway-authorizer';
import { Context } from 'aws-lambda';

export interface Response {
  isAuthorized: boolean;
}

const Allow: Response = {
  isAuthorized: true,
};

const Deny: Response = {
  isAuthorized: false,
};

export async function handler(event: APIGatewayRequestAuthorizerEventV2, context: Context): Promise<Response> {
  setContext(context, 'lambda.ts');
  logger.logEventIfEnabled(event);

  const allowList = new BlockList();

  const ipv4AllowList = process.env.CIDR_IPV4_ALLOW_LIST ?? null;

  if (ipv4AllowList === null) {
    logger.error('CIDR_IPV4_ALLOW_LIST is not set.');
    return Deny;
  }

  //Check if CIDR_IPV4_ALLOW_LIST matches the format of a comma-separated list of CIDR blocks
  const regex = new RegExp('^(\\d{1,3}\\.){3}\\d{1,3}\\/\\d{1,2}(,(\\d{1,3}\\.){3}\\d{1,3}\\/\\d{1,2})*$');
  if (!regex.test(ipv4AllowList)) {
    logger.error(
      'CIDR_IPV4_ALLOW_LIST is not in the correct format. ' +
        'Expected format is a comma-separated list of CIDR blocks. e.g. 10.0.0.0/8,81.32.12.3/32',
    );
    return Deny;
  }

  ipv4AllowList.split(',').forEach((cidrBlock) => {
    const [subnet, mask] = cidrBlock.split('/');
    allowList.addSubnet(subnet, parseInt(mask), 'ipv4');
  });

  const clientIP = event.requestContext.http.sourceIp;

  if (allowList.check(clientIP)) {
    return Allow;
  } else {
    return Deny;
  }
}
