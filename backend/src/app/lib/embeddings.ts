import config from '../config';
import { openrouter } from './openrouterClient';

export const embed = async (text: string): Promise<number[]> => {
  const response = await openrouter.embeddings.create({
    model: config.embedding_model as string,
    input: text,
  });

  const vector = response.data[0]?.embedding;
  if (!Array.isArray(vector)) {
    throw new Error('OpenRouter embedding response did not contain a vector');
  }
  return vector;
};
