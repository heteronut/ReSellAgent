const axios = require('axios');

const LANGFLOW_URL = process.env.LANGFLOW_SERVER_URL || 'http://127.0.0.1:7860';
const API_KEY = process.env.LANGFLOW_API_KEY;
const AI_API_BASE_URL = process.env.AI_API_BASE_URL;
const AI_API_KEY = process.env.AI_API_KEY;
const AI_MODEL = process.env.AI_MODEL || 'kr/auto';

function responseText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content
      .filter(part => part && part.type === 'text' && typeof part.text === 'string')
      .map(part => part.text)
      .join('\n')
      .trim();
    if (text) return text;
  }
  throw new Error('API AI tidak mengembalikan teks respons.');
}

async function runOpenAiCompatible(inputValue) {
  if (!AI_API_KEY) throw new Error('AI_API_KEY belum dikonfigurasi di backend/config.env.');

  const baseUrl = AI_API_BASE_URL.replace(/\/+$/, '');
  const url = `${baseUrl}/chat/completions`;
  const payload = {
    model: AI_MODEL,
    messages: [{ role: 'user', content: inputValue }]
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 120000
    });
    return responseText(response.data);
  } catch (axiosErr) {
    const status = axiosErr.response?.status;
    const detail = axiosErr.response?.data?.error?.message
      || axiosErr.response?.data?.message
      || axiosErr.message;
    const errMsg = status
      ? `AI API HTTP ${status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`
      : axiosErr.message;
    throw new Error(errMsg);
  }
}

/**
 * Run a prompt through an OpenAI-compatible API or a configured Langflow flow.
 * @param {string} flowId - The Langflow flow UUID when using the Langflow fallback
 * @param {string} inputValue - The chat input message
 * @returns {Promise<string>} - The response text
 */
async function runFlow(flowId, inputValue, tweaks) {
  if (AI_API_BASE_URL) return runOpenAiCompatible(inputValue);

  return runLangflowFlow(flowId, inputValue, tweaks);
}

async function runLangflowFlow(flowId, inputValue, tweaks) {
  if (!flowId || !flowId.trim()) {
    throw new Error('AI_API_BASE_URL belum dikonfigurasi dan Langflow flow ID tidak tersedia.');
  }

  const url = `${LANGFLOW_URL}/api/v1/run/${flowId}?stream=false`;

  const payload = {
    input_value: inputValue,
    input_type: 'chat',
    output_type: 'chat',
    tweaks: tweaks && typeof tweaks === 'object' ? tweaks : {}
  };

  const headers = {
    'Content-Type': 'application/json'
  };
  if (API_KEY) {
    headers['x-api-key'] = API_KEY;
  }

  let response;
  try {
    response = await axios.post(url, payload, { headers, timeout: 120000 });
  } catch (axiosErr) {
    const status = axiosErr.response?.status;
    const detail = axiosErr.response?.data?.detail
      || axiosErr.response?.data?.message
      || axiosErr.response?.data?.error
      || axiosErr.message;
    const errMsg = status
      ? `Langflow HTTP ${status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`
      : axiosErr.message;
    throw new Error(errMsg);
  }

  // Extract text from response
  const outputs = response.data?.outputs?.[0]?.outputs?.[0];
  const text =
    outputs?.results?.message?.text ||
    outputs?.outputs?.message?.message ||
    outputs?.artifacts?.message;

  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Langflow tidak mengembalikan teks respons.');
  }

  return text;
}

module.exports = { runFlow, runLangflowFlow };
