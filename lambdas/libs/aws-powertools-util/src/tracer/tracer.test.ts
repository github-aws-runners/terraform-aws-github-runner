import { captureLambdaHandler, getTracedAWSV3Client, tracer } from '../';

describe('A root tracer.', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  test('Should call underlying tracer.', async () => {
    jest.spyOn(tracer, 'captureAWSv3Client');
    getTracedAWSV3Client({});
    expect(tracer.captureAWSv3Client).toBeCalledTimes(1);
  });
  test('Should have a working middleware', async () => {
    const { before } = captureLambdaHandler(tracer);
    expect(before).toBeDefined();
  });
});
