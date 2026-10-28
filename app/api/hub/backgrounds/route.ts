import { NextResponse } from 'next/server';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import generated from '../../../lib/support/hubBackgrounds.generated.json';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type PublicBackground = { id: string; name: string; url: string };
/** Dev reads the live folder; packaged/serverless deployments use the generated build manifest. */
export async function GET() {
  let items: PublicBackground[] = generated as PublicBackground[];
  try {
    const folder = path.join(process.cwd(), 'public', 'chat-backgroundimages');
    const names = await readdir(folder, { withFileTypes: true });
    const discovered = names.filter(f => f.isFile() && /\.(png|jpe?g|webp|gif|avif)$/i.test(f.name) && !f.name.startsWith('.'))
      .map(f => ({ id: `public:${f.name}`, name: f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), url: `/chat-backgroundimages/${encodeURIComponent(f.name)}` }))
      .sort((a,b) => a.name.localeCompare(b.name));
    if (process.env.NODE_ENV !== 'production' || discovered.length) items = discovered;
  } catch { /* Serverless builds may not expose the public directory to route handlers. */ }
  return NextResponse.json({ images: items }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
