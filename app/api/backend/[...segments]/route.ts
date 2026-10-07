import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { authorizeOrganization } from '@/lib/server/organization-access';

type RouteContext = {
  params: { segments: string[] };
};

const allowedRoutes: Record<string, string[]> = {
  GET: [
    'health',
    'me',
    'invoices',
    'documents',
    'documents/:id',
    'jobs/:id',
  ],
  POST: [
    'webhooks/process-invoice',
    'documents/export',
    'documents/:id/approve',
  ],
  PATCH: ['documents/:id'],
  DELETE: ['documents/:id'],
};

function errorResponse(status: number, error: string, message: string) {
  return NextResponse.json(
    { error, message, details: null },
    { status },
    );
}

function isAllowedRoute(method: string, segments: string[]): boolean {
  const patterns = allowedRoutes[method];
  if (!patterns) return false;
  const route = segments.join('/');
  return patterns.some((pattern) => {
    const expected = pattern.split('/');
    return (
      expected.length === segments.length &&
      expected.every((part, index) => part === ':id' || part === segments[index])
    );
  });
}

async function proxyRequest(request: Request, context: RouteContext) {
  const method = request.method.toUpperCase();
  const segments = context.params.segments ?? [];
  if (!isAllowedRoute(method, segments)) {
    return errorResponse(404, 'Not Found', 'Backend route not found.');
  }

  const backendUrl = process.env.BACKEND_API_URL;
  if (!backendUrl) {
    return errorResponse(
      503,
      'Service Unavailable',
      'Document backend is not configured.',
    );
  }

  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(
      segments.map((segment) => encodeURIComponent(segment)).join('/'),
      `${backendUrl.replace(/\/+$/, '')}/`,
    );
  } catch {
    return errorResponse(503, 'Service Unavailable', 'Document backend URL is invalid.');
  }
  upstreamUrl.search = new URL(request.url).search;

  const authClient = createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();
  if (authError || !user) {
    return errorResponse(401, 'Unauthorized', 'Sign in to continue.');
  }

  const isHealthRoute = method === 'GET' && segments.join('/') === 'health';
  let apiKey: string | undefined;
  if (!isHealthRoute) {
    const organizationId = request.headers.get('x-organization-id');
    if (!organizationId) {
      return errorResponse(400, 'Bad Request', 'Select an organization first.');
    }
    try {
      const organization = await authorizeOrganization(user.id, organizationId);
      if (!organization) {
        return errorResponse(403, 'Forbidden', 'You do not have access to this organization.');
      }
      apiKey = organization.apiKey;
    } catch {
      return errorResponse(
        503,
        'Service Unavailable',
        'Organization backend access is not configured.',
      );
    }
  }

  const headers = new Headers();
  if (apiKey) headers.set('x-api-key', apiKey);
  const idempotencyKey = request.headers.get('idempotency-key');
  if (idempotencyKey) headers.set('idempotency-key', idempotencyKey);

  let body: BodyInit | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.toLowerCase().startsWith('multipart/form-data')) {
      let incomingForm: FormData;
      try {
        incomingForm = await request.formData();
      } catch {
        return errorResponse(400, 'Bad Request', 'Invalid multipart upload.');
      }
      const outgoingForm = new FormData();
      incomingForm.forEach((value, name) => {
        if (typeof value === 'string') {
          outgoingForm.append(name, value);
        } else {
          outgoingForm.append(name, value, value.name);
        }
      });
      body = outgoingForm;
    } else {
      if (contentType) headers.set('content-type', contentType);
      body = await request.arrayBuffer();
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    return errorResponse(
      error instanceof DOMException && error.name === 'TimeoutError' ? 504 : 502,
      error instanceof DOMException && error.name === 'TimeoutError'
        ? 'Gateway Timeout'
        : 'Bad Gateway',
      'The document backend could not be reached.',
    );
  }

  const responseHeaders = new Headers();
  for (const name of ['content-type', 'content-disposition', 'cache-control']) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  responseHeaders.set('cache-control', 'no-store');
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
