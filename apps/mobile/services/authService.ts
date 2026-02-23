import { api } from '../services/api';
import type { LoginRequest, RegisterRequest } from '@streamer/shared';

export const authService = {
    register: async (data: RegisterRequest) => {
        const response = await api.post('/api/auth/register', data);
        return response.data;
    },

    login: async (data: LoginRequest) => {
        const response = await api.post('/api/auth/login', data);
        return response.data;
    },

    refresh: async (refreshToken: string) => {
        const response = await api.post('/api/auth/refresh', { refreshToken });
        return response.data;
    },
};
