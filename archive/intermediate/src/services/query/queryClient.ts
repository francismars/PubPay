import { QueryClient } from '@tanstack/react-query';

let client: QueryClient | null = null;

export const getQueryClient = (): QueryClient => {
  if (!client) {
    client = new QueryClient();
  }
  return client;
};
