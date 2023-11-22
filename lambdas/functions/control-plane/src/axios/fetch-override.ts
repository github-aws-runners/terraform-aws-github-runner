import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

type FetchResponse = AxiosResponse & { json: () => string };

type FetchOptions = AxiosRequestConfig & { body?: object };

// Fetch is not covered to be traced by xray so we need to override it with axios
// https://github.com/aws/aws-xray-sdk-node/issues/531
export const axiosFetch = async (url: string, options: FetchOptions): Promise<FetchResponse> => {
  const response = await axios(url, { ...options, data: options.body });
  return new Promise((resolve) => {
    resolve({
      ...response,
      json: () => {
        return response.data;
      },
    });
  });
};
