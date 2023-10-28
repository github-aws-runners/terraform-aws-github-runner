import axios from 'axios';

import { axiosFetch } from './fetch-override';

jest.mock('axios');

describe('axiosFetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it('should return a promise that resolves with the response data', async () => {
    // Arrange
    const url = 'https://example.com';
    const options = { body: { foo: 'bar' } };
    const responseData = { data: { baz: 'qux' } };
    const mockedAxios = axios as unknown as jest.Mock;
    mockedAxios.mockResolvedValue(responseData);

    // Act
    const result = (await axiosFetch(url, options)) as any;

    // Assert
    expect(axios).toHaveBeenCalledWith(url, { ...options, data: options.body });
    expect(result).toEqual({
      ...responseData,
      json: expect.any(Function),
    });
    expect(result.json()).toEqual(responseData.data);
  });
});
