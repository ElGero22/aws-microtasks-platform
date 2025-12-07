export const authConfig = {
    Auth: {
        Cognito: {
            userPoolId: import.meta.env.VITE_PLATFORM_USER_POOL_ID,
            userPoolClientId: import.meta.env.VITE_PLATFORM_CLIENT_ID,
        },
    },
};

export const apiConfig = {
    endpoint: import.meta.env.VITE_API_URL,
};
