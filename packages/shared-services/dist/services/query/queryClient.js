import { QueryClient } from '@tanstack/react-query';
let client = null;
export const getQueryClient = () => {
    if (!client) {
        client = new QueryClient();
    }
    return client;
};
