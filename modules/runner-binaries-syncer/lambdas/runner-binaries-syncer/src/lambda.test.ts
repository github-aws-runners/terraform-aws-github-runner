import { sync } from './syncer/syncer';
import { handler } from './lambda';
import { mocked } from 'ts-jest/utils';

jest.mock('./syncer/syncer');

describe('Test scale up lambda wrapper.', () => {
  it('Scale without error should resolve.', async () => {
    const mock = mocked(sync);
    mock.mockImplementation(() => {
      return new Promise((resolve) => {
        resolve();
      });
    });
    await expect(handler({}, {})).resolves;
  });

  it('Scale without error should resolve2 . ', async () => {
    const mock = mocked(sync);
    mock.mockRejectedValue(new Error(''));

    await expect(handler({}, {})).resolves;
  });
});
