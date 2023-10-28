import axios from 'axios';

export const axiosFetch = async (url: string, options: any) => {
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
