import type OpenAI from 'openai';

export interface EmbedOptions {
  model: string;
  batchSize: number;
  maxRetries: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One batch of texts -> one embedding vector each, retried with exponential
 * backoff (rate limits / transient 5xxs are the common failure mode here).
 * Throws once `maxRetries` attempts are exhausted so the caller can record
 * the batch's rows as failed rather than silently dropping them.
 */
async function embedBatchWithRetry(
  openai: OpenAI,
  batch: string[],
  opts: EmbedOptions,
  attempt = 1
): Promise<number[][]> {
  try {
    const response = await openai.embeddings.create({ model: opts.model, input: batch });
    return response.data.map((item) => item.embedding as number[]);
  } catch (err) {
    if (attempt >= opts.maxRetries) throw err;
    const delayMs = Math.min(1000 * 2 ** (attempt - 1), 8000);
    await sleep(delayMs);
    return embedBatchWithRetry(openai, batch, opts, attempt + 1);
  }
}

/**
 * Embeds `texts` in fixed-size batches. A batch that fails after all retries
 * throws with the failing batch's own index range attached, so the ingestion
 * pipeline can record exactly which chunks in the page were not embedded
 * instead of failing the entire run.
 */
export async function embedTexts(
  openai: OpenAI,
  texts: string[],
  opts: EmbedOptions
): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += opts.batchSize) {
    const batch = texts.slice(i, i + opts.batchSize);
    try {
      const embeddings = await embedBatchWithRetry(openai, batch, opts);
      results.push(...embeddings);
    } catch (err: any) {
      const wrapped = new Error(
        `Embedding batch [${i}, ${i + batch.length}) failed after ${opts.maxRetries} attempt(s): ${err?.message ?? err}`
      );
      (wrapped as any).batchStart = i;
      (wrapped as any).batchLength = batch.length;
      (wrapped as any).cause = err;
      throw wrapped;
    }
  }

  return results;
}
