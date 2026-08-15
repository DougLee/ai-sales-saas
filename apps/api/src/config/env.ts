import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32),
  OPENAI_API_KEY: z.string().optional(),
  EMBEDDING_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  SENSEVOICE_API_KEY: z.string().optional(),
  MINIO_ENDPOINT: z.string().optional(),
  MINIO_ACCESS_KEY: z.string().optional(),
  MINIO_SECRET_KEY: z.string().optional(),
  BING_SEARCH_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),

  // Rate limiting
  RATE_LIMIT_DEFAULT_MAX: z.string().transform(Number).default('200'),
  RATE_LIMIT_DEFAULT_WINDOW_MS: z.string().transform(Number).default('60000'),
  RATE_LIMIT_AGENT_MAX: z.string().transform(Number).default('20'),
  RATE_LIMIT_AGENT_WINDOW_MS: z.string().transform(Number).default('60000'),

  // Observability
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  SERVICE_NAME: z.string().default('ai-sales-api'),
  SERVICE_VERSION: z.string().optional(),
})

export const env = envSchema.parse(process.env)
