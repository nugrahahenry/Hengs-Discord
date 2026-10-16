'use strict';

// Reuse an existing configured provider. No tools, chat history, retries or model rotation.
function createNewsCompletion({ client, model } = {}) {
  if (!client || !model) return null;
  return async (messages, { signal }) => {
    const response = await client.chat.completions.create({
      model, messages, temperature: 0.2, max_tokens: 700,
      response_format: { type: 'json_object' },
    }, { signal, timeout: 8000, maxRetries: 0 });
    if (response.choices?.[0]?.finish_reason !== 'stop') throw new Error('NEWS_EDITOR_INCOMPLETE');
    return response.choices[0].message?.content;
  };
}

module.exports = { createNewsCompletion };
