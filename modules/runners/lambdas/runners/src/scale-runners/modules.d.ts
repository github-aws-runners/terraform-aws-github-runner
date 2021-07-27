declare namespace NodeJS {
    export interface ProcessEnv {
        ENVIRONMENT: string
        SUBNET_IDS: string
        GHES_URL: string
        SCALE_DOWN_CONFIG: string
        MINIMUM_RUNNING_TIME_IN_MINUTES: string
        LAUNCH_TEMPLATE_NAME: string
        AWS_REGION: string
        PARAMETER_GITHUB_APP_CLIENT_ID_NAME: string
        PARAMETER_GITHUB_APP_CLIENT_SECRET_NAME: string
        PARAMETER_GITHUB_APP_ID_NAME: string
        PARAMETER_GITHUB_APP_KEY_BASE64_NAME: string
    }
}
