'use strict';

class NewsCompletionError extends Error {
  constructor(code) { super(code); this.name = 'NewsCompletionError'; this.code = code; }
}

function providerFailure(error) {
  if (error?.status === 401 || error?.status === 403) return 'NEWS_EDITOR_ACCESS_DENIED';
  if (error?.status === 429) return 'NEWS_EDITOR_RATE_LIMITED';
  if (error?.status === 408 || ['AbortError', 'APIUserAbortError', 'APIConnectionTimeoutError'].includes(error?.name)) {
    return 'NEWS_EDITOR_TIMEOUT';
  }
  if (error?.status === 400 || error?.status === 422) return 'NEWS_EDITOR_REQUEST_REJECTED';
  return 'NEWS_EDITOR_PROVIDER_UNAVAILABLE';
}

function responseFormat(strict) {
  if (!strict) return { type: 'json_object' };
  return { type: 'json_schema', json_schema: { name: 'hengs_news', strict: true, schema: {
    type: 'object', additionalProperties: false, required: ['items'], properties: {
      items: { type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['id', 'title', 'summary'],
        properties: { id: { type: 'string', enum: ['0', '1', '2'] },
          title: { type: ['string', 'null'] }, summary: { type: ['string', 'null'] } },
      } },
    },
  } } };
}

// Reuse an existing configured provider. No tools, chat history, retries or model rotation.
function createNewsCompletion({ client, model, provider } = {}) {
  if (!client || !model) return null;
  const groqOss = provider === 'groq' && ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'].includes(model);
  return async (messages, { signal }) => {
    let response;
    try {
      response = await client.chat.completions.create({
        model, messages, temperature: 0.2,
        ...(groqOss ? { max_completion_tokens: 700, reasoning_effort: 'low', include_reasoning: false }
          : { max_tokens: 700 }),
        response_format: responseFormat(groqOss),
      }, { signal, timeout: 8000, maxRetries: 0 });
    } catch (error) { throw new NewsCompletionError(providerFailure(error)); }
    const choice = response?.choices?.[0];
    if (choice?.finish_reason !== 'stop') throw new NewsCompletionError('NEWS_EDITOR_INCOMPLETE');
    if (typeof choice.message?.content !== 'string' || !choice.message.content.trim()) {
      throw new NewsCompletionError('NEWS_EDITOR_EMPTY_RESPONSE');
    }
    return choice.message.content;
  };
}

module.exports = { createNewsCompletion, NewsCompletionError };
