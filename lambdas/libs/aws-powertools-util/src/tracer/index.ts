import { Tracer } from '@aws-lambda-powertools/tracer';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';

const tracer = new Tracer();

function getTracedAWSV3Client<T>(client: T): T {
  return tracer.captureAWSv3Client(client);
}
export { tracer, captureLambdaHandler, getTracedAWSV3Client };
