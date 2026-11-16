import type { NextRequest } from 'next/server';

export async function GET(_request: NextRequest) {
  return Response.json({
    ok: true,
    service: 'schoolos-web',
    message: 'SchoolOS API is running.',
  });
}
