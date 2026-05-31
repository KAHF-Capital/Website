// Legacy API endpoint. The handler now lives at /api/kahf-ai-chat. This shim
// keeps any old client / external integration calling /api/sonnet-chat working.
export { default } from './kahf-ai-chat';
