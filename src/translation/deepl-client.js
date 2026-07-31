const fsp = require('node:fs/promises');
const path = require('node:path');

class DeepLHttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'DeepLHttpError';
    this.statusCode = statusCode;
  }
}

class DeepLClient {
  constructor(authKey, fetchImpl = globalThis.fetch) {
    if (!authKey) throw new Error('DEEPL_API_KEY belum tersedia.');
    if (typeof fetchImpl !== 'function') throw new Error('Runtime fetch tidak tersedia.');
    this.authKey = authKey;
    this.fetch = fetchImpl;
    this.baseUrl = authKey.endsWith(':fx')
      ? 'https://api-free.deepl.com'
      : 'https://api.deepl.com';
  }

  async request(endpoint, options = {}, responseType = 'json') {
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `DeepL-Auth-Key ${this.authKey}`);
    const response = await this.fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
      signal: options.signal || AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      let detail = '';
      try {
        const payload = await response.json();
        detail = payload.message || payload.detail || '';
      } catch {}
      throw new DeepLHttpError(
        response.status,
        detail || `DeepL request gagal (${response.status}).`,
      );
    }

    if (responseType === 'buffer') {
      return Buffer.from(await response.arrayBuffer());
    }
    return response.json();
  }

  async getUsage() {
    const usage = await this.request('/v2/usage');
    return {
      character: {
        count: usage.character_count,
        limit: usage.character_limit,
      },
    };
  }

  async getTargetLanguages() {
    const languages = await this.request('/v2/languages?type=target');
    return languages.map(language => ({
      code: language.language,
      name: language.name,
      supportsFormality: Boolean(language.supports_formality),
    }));
  }

  async uploadDocument(inputPath, targetLanguage) {
    const bytes = await fsp.readFile(inputPath);
    const form = new FormData();
    form.append('file', new Blob([bytes]), path.basename(inputPath));
    form.append('target_lang', targetLanguage);
    const payload = await this.request('/v2/document', {
      method: 'POST',
      body: form,
    });
    return {
      documentId: payload.document_id,
      documentKey: payload.document_key,
    };
  }

  async getDocumentStatus(handle) {
    const body = new URLSearchParams({ document_key: handle.documentKey });
    const payload = await this.request(
      `/v2/document/${encodeURIComponent(handle.documentId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );
    return {
      status: payload.status,
      secondsRemaining: payload.seconds_remaining,
      billedCharacters: payload.billed_characters,
      errorMessage: payload.error_message,
    };
  }

  async downloadDocument(handle, outputPath) {
    const body = new URLSearchParams({ document_key: handle.documentKey });
    const bytes = await this.request(
      `/v2/document/${encodeURIComponent(handle.documentId)}/result`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
      'buffer',
    );
    await fsp.writeFile(outputPath, bytes, { flag: 'wx' });
  }
}

module.exports = { DeepLClient, DeepLHttpError };
