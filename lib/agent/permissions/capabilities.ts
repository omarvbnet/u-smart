import type { AgentCapability, AgentContext } from '@/lib/agent/types';

const FIELD_ROLES = new Set([
  'ENGINEER',
  'TECHNICIAN',
  'WORKER',
  'WAREHOUSE_KEEPER',
  'QUALITY_ENGINEER',
  'SUPERVISION_ENGINEER',
]);

const MANAGEMENT_ROLES = new Set(['COMPANY', 'MANAGER', 'COORDINATOR', 'COMPANY_OWNER', 'ADMIN']);

const TICKET_CREATE_ROLES = new Set([
  'COMPANY',
  'MANAGER',
  'COORDINATOR',
  'ENGINEER',
  'TECHNICIAN',
  'PERSONAL',
  'COMPANY_OWNER',
]);

/**
 * Server-side capability map. Never trust the client for these checks.
 * Actions always run as the signed-in user — never elevated to platform admin.
 */
export function resolveAgentCapabilities(ctx: AgentContext): Set<AgentCapability> {
  const caps = new Set<AgentCapability>(['agent.use', 'agent.request_approval']);
  const role = String(ctx.role || '').toUpperCase();

  caps.add('agent.read_tickets');
  caps.add('agent.read_sites');
  caps.add('agent.create_document');

  if (TICKET_CREATE_ROLES.has(role) || ctx.isWorkspaceOwner) {
    caps.add('agent.create_ticket');
  }

  if (MANAGEMENT_ROLES.has(role) || ctx.isWorkspaceOwner) {
    caps.add('agent.read_kpis');
    caps.add('agent.create_task_note');
    caps.add('agent.send_notification');
    caps.add('agent.manage_approvals');
    caps.add('agent.assign_ticket');
    caps.add('agent.read_warehouse');
  }

  if (role === 'WAREHOUSE_KEEPER') {
    caps.add('agent.read_warehouse');
  }

  if (role === 'COMPANY' || role === 'PERSONAL' || ctx.isWorkspaceOwner) {
    caps.add('agent.report_conflict');
  }

  if (ctx.isWorkspaceOwner || role === 'COMPANY' || role === 'COMPANY_OWNER') {
    caps.add('agent.manage_policy');
  }

  if (FIELD_ROLES.has(role)) {
    caps.add('agent.create_task_note');
    if (role === 'ENGINEER' || role === 'TECHNICIAN') {
      caps.add('agent.assign_ticket');
    }
  }

  if (role === 'PERSONAL') {
    caps.add('agent.read_tickets');
    caps.add('agent.read_sites');
  }

  return caps;
}

export function hasAgentCapability(
  caps: Set<AgentCapability>,
  required: AgentCapability | AgentCapability[]
): boolean {
  const list = Array.isArray(required) ? required : [required];
  return list.every((c) => caps.has(c));
}
