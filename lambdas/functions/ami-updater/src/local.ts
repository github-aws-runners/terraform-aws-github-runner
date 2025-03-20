import { handler } from './lambda';
import { Context } from 'aws-lambda';

async function localRun() {
  const mockEvent = {
    // Add mock event data here
  };

  const mockContext: Context = {
    awsRequestId: 'local-test',
    functionName: 'ami-updater',
    callbackWaitsForEmptyEventLoop: false,
    functionVersion: '$LATEST',
    invokedFunctionArn: 'local',
    memoryLimitInMB: '128',
    logGroupName: 'local',
    logStreamName: 'local',
    getRemainingTimeInMillis: () => 1000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };

  try {
    const result = await handler(mockEvent, mockContext);
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

localRun();
