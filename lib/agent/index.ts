/** U Agent — AI operating layer inside Proviser. */

export { runAgentMessage } from '@/lib/agent/core/run';
export { resolveAgentAuth } from '@/lib/agent/auth-context';
export { registerProviserTools } from '@/lib/agent/tools/proviser-tools';
export { registerPhase1Tools } from '@/lib/agent/tools/phase1-tools';
export { registerDocumentTools } from '@/lib/agent/tools/document-tools';
export { registerWhatsAppTools } from '@/lib/agent/tools/whatsapp-tools';
export { modelRouter } from '@/lib/agent/models/router';
export { isUAgentGloballyEnabled } from '@/lib/agent/config';
export { handleWhatsAppIngress } from '@/lib/agent/channels/whatsapp-ingress';
export { processAgentAttachments } from '@/lib/agent/multimodal/process';
export { updateAgentPolicy, getOrCreateAgentPolicy } from '@/lib/agent/policies/policy';
export { invalidateAiProviderCache, loadResolvedProviders } from '@/lib/agent/providers/registry';
