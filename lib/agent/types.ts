export type AgentRiskLevel =
  | 'READ'
  | 'LOW'
  | 'EXTERNAL'
  | 'HIGH_IMPACT'
  | 'FINANCIAL'
  | 'CRITICAL';

export type AgentExecutionStatus =
  | 'ONLINE'
  | 'THINKING'
  | 'PLANNING'
  | 'WAITING_APPROVAL'
  | 'EXECUTING'
  | 'WAITING_EXTERNAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'OFFLINE';

export type AgentTimelineStep = {
  at: string;
  label: string;
  status: AgentExecutionStatus | 'DONE' | 'SKIPPED';
  tool?: string;
  detail?: string;
};

export type AgentContext = {
  userId: string;
  username: string;
  name: string | null;
  role: string;
  privateCompanyId: string | null;
  isWorkspaceOwner: boolean;
  departmentId: string | null;
  locale?: string | null;
};

export type AgentPolicySnapshot = {
  enabled: boolean;
  autonomyLevel: number;
  allowedTools: string[] | null;
  maxTransactionIqd: number;
  dailySpendLimitIqd: number;
  dailyAiRequestLimit: number;
  whatsappIngressEnabled: boolean;
};

export type AgentCapability =
  | 'agent.use'
  | 'agent.read_tickets'
  | 'agent.read_sites'
  | 'agent.read_kpis'
  | 'agent.read_warehouse'
  | 'agent.create_task_note'
  | 'agent.create_ticket'
  | 'agent.assign_ticket'
  | 'agent.report_conflict'
  | 'agent.send_notification'
  | 'agent.request_approval'
  | 'agent.manage_approvals'
  | 'agent.manage_policy';
