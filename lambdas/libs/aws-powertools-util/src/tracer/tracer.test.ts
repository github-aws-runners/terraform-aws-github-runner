import { captureLambdaHandler, getTracedAWSV3Client, tracer } from '../';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('A root tracer.', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  it('Should call underlying tracer.', async () => {
    vi.spyOn(tracer, 'captureAWSv3Client');
    getTracedAWSV3Client({});
    expect(tracer.captureAWSv3Client).toBeCalledTimes(1);
  });
  it('Should have a working middleware', async () => {
    const { before } = captureLambdaHandler(tracer);
    expect(before).toBeDefined();
  });
});
