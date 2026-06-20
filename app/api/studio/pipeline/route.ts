import { NextRequest, NextResponse } from 'next/server';
import { getStudioUserId } from '@/lib/studio-auth';
import { getStudioProject } from '@/lib/studio-db';
import { runAutonomousPipeline } from '@/app/studio/lib/platform/pipeline';
import { parseProjectBrief } from '@/app/studio/lib/nl/parse-brief';
import { defaultProject } from '@/app/studio/lib/project';
import type { DesignFile } from '@/app/studio/lib/store';
import { recordStudioReport } from '@/lib/studio-db-sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body = {
  projectId?: string;
  brief?: string;
  design?: DesignFile;
  locale?: 'ar' | 'en' | 'ku' | 'tr';
};

/** Server-side autonomous engineering pipeline — deterministic, no LLM math. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const locale = body.locale ?? 'en';

    let project = defaultProject();
    let rooms: ReturnType<typeof runAutonomousPipeline>['rooms'] = [];

    if (body.brief) {
      const parsed = parseProjectBrief(body.brief, project);
      project = parsed.project;
      rooms = parsed.rooms.map((r, i) => ({ ...r, id: `room_srv_${i}` }));
    } else if (body.design) {
      project = body.design.project ?? project;
      rooms = (body.design.rooms ?? []).map((r) => ({ ...r }));
    } else if (body.projectId) {
      const userId = getStudioUserId(req);
      const file = await getStudioProject(body.projectId, userId);
      project = file.project ?? project;
      rooms = file.rooms ?? [];
    } else {
      return NextResponse.json({ error: 'Provide brief, design, or projectId' }, { status: 400 });
    }

    const result = runAutonomousPipeline(project, rooms, locale);

    if (body.projectId) {
      await recordStudioReport(body.projectId, 'pipeline', 'Autonomous pipeline run', {
        boqGrandTotal: result.boqGrandTotal,
        nodeCount: result.nodes.length,
        assumptions: result.assumptions,
      });
    }

    return NextResponse.json({
      ok: true,
      deliverables: {
        designName: result.designName,
        nodes: result.nodes,
        edges: result.edges,
        rooms: result.rooms,
        controls: result.controls,
        map: result.map,
        hvac: result.hvac,
        lighting: result.lighting,
        smart: result.smart,
        boqGrandTotal: result.boqGrandTotal,
        assumptions: result.assumptions,
      },
    });
  } catch (e) {
    console.error('[studio/pipeline POST]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Pipeline failed' }, { status: 500 });
  }
}
