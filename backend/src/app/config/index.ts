import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

export default {
  node_env: process.env.NODE_ENV,
  port: process.env.PORT,
  web_url: process.env.WEB_URL,

  database_url: process.env.DATABASE_URL,
  redis_url: process.env.REDIS_URL,

  openrouter_api_key: process.env.OPENROUTER_API_KEY,
  llm_model_standard: process.env.LLM_MODEL_STANDARD,
  llm_model_content: process.env.LLM_MODEL_CONTENT,
  llm_model_fallback: process.env.LLM_MODEL_FALLBACK,

  embedding_model: process.env.EMBEDDING_MODEL,
};
