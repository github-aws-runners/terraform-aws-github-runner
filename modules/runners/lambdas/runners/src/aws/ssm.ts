import { SSM } from '@aws-sdk/client-ssm';
import { NodeHttpHandler } from '@aws-sdk/node-http-handler';
import proxy from 'proxy-agent';

export async function getParameterValue(parameter_name: string): Promise<string> {
  // Proxy with aws-sdk v3
  // Configured by client (global configuration like v2 doesn't work)
  // https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/node-configuring-proxies.html
  let rh = undefined;
  const httpsProxy = process.env.HTTPS_PROXY;
  if (httpsProxy != null && httpsProxy.startsWith('http')) {
    rh = new NodeHttpHandler({
      httpsAgent: new proxy(httpsProxy),
    });
  }
  const client = new SSM({ region: process.env.AWS_REGION, requestHandler: rh });
  return (await client.getParameter({ Name: parameter_name, WithDecryption: true })).Parameter?.Value as string;
}
