import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { uploadFile } from '@/lib/upload';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_SIZE = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json(
      { success: false, message: 'Not authenticated' },
      { status: 401 }
    );
  }
  if (auth.payload.identitySource === 'coordinator_user') {
    return NextResponse.json(
      { success: false, message: 'Coordinator users update their photo via their company.' },
      { status: 403 }
    );
  }

  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { success: false, message: 'No image provided' },
        { status: 400 }
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, message: 'Image too large (max 5MB).' },
        { status: 400 }
      );
    }
    if (file.type && !ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, message: 'Allowed types: JPEG, PNG, WebP, HEIC.' },
        { status: 400 }
      );
    }

    const ext = path.extname(file.name) || '.jpg';
    const safeName = `${auth.payload.requesterId}-${Date.now()}${ext}`;
    const { url } = await uploadFile({
      file,
      folder: 'profile-photos',
      prefix: 'profile',
      safeName,
    });

    await (prisma.ticketRequester as any).update({
      where: { id: auth.payload.requesterId },
      data: { photoUrl: url },
    });

    return NextResponse.json({ success: true, photoUrl: url });
  } catch (err) {
    console.error('POST /api/profile/photo:', err);
    return NextResponse.json(
      { success: false, message: 'Photo upload failed' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json(
      { success: false, message: 'Not authenticated' },
      { status: 401 }
    );
  }
  if (auth.payload.identitySource === 'coordinator_user') {
    return NextResponse.json(
      { success: false, message: 'Coordinator users manage their photo via their company.' },
      { status: 403 }
    );
  }
  try {
    await (prisma.ticketRequester as any).update({
      where: { id: auth.payload.requesterId },
      data: { photoUrl: null },
    });
    return NextResponse.json({ success: true, photoUrl: null });
  } catch (err) {
    console.error('DELETE /api/profile/photo:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to clear photo' },
      { status: 500 }
    );
  }
}
