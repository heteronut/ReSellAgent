const axios = require('axios');

const LANGFLOW_URL = process.env.LANGFLOW_SERVER_URL || 'http://127.0.0.1:7860';
const API_KEY = process.env.LANGFLOW_API_KEY;

/**
 * Run a Langflow flow via REST API
 * @param {string} flowId - The flow UUID
 * @param {string} inputValue - The chat input message
 * @returns {Promise<string>} - The response text
 */
async function runFlow(flowId, inputValue, tweaks) {
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
    outputs?.artifacts?.message ||
    'Tidak ada respons dari AI.';

  return text;
}

module.exports = { runFlow };
