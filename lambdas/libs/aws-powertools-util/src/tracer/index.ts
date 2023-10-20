import { Tracer, captureLambdaHandler } from '@aws-lambda-powertools/tracer';

const tracer = new Tracer({
  serviceName: process.env.SERVICE_NAME || 'runners',
});

function getTracedAWSV3Client<T>(client: T): T {
  return tracer.captureAWSClient(client);
}
export { tracer, captureLambdaHandler, getTracedAWSV3Client };
