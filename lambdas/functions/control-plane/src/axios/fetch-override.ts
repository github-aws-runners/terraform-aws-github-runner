import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

type FetchResponse = AxiosResponse & { json: () => string };

type FetchOptions = AxiosRequestConfig & { body?: object };

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
