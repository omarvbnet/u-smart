import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth } from '@/lib/agent/auth-context';
import { getWhatsAppConsent, upsertWhatsAppConsent } from '@/lib/agent/whatsapp/consent';
import { isWhatsAppCloudConfigured } from '@/lib/whatsapp-cloud-messaging';
import { writeAgentAudit } from '@/lib/agent/usage';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }
  const consent = await getWhatsAppConsent(auth.ctx.userId);
  return NextResponse.json({
    success: true,
    consent,
    cloudConfigured: isWhatsAppCloudConfigured(),
    ingressEnabled: auth.policy.whatsappIngressEnabled === true,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  let body: {
    granted?: boolean;
    canSendMessages?: boolean;
    canSendFiles?: boolean;
    canStartCalls?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const consent = await upsertWhatsAppConsent(auth.ctx.userId, {
      granted: typeof body.granted === 'boolean' ? body.granted : undefined,
      canSendMessages:
        typeof body.canSendMessages === 'boolean' ? body.canSendMessages : undefined,
      canSendFiles: typeof body.canSendFiles === 'boolean' ? body.canSendFiles : undefined,
      canStartCalls: typeof body.canStartCalls === 'boolean' ? body.canStartCalls : undefined,
    });

    await writeAgentAudit({
      privateCompanyId: auth.ctx.privateCompanyId,
      actorUserId: auth.ctx.userId,
      action: consent.granted ? 'WHATSAPP_CONSENT_GRANTED' : 'WHATSAPP_CONSENT_REVOKED',
      result: consent,
    });

    return NextResponse.json({ success: true, consent });
  } catch (e) {
    console.error('PATCH /api/agent/whatsapp/consent:', e);
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : 'Failed to update WhatsApp consent',
      },
      { status: 500 }
    );
  }
}
