export type PreparedUpstreamBody = {
  body?: ArrayBuffer;
  contentType?: string;
};

type MultipartFilePart = {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
};

function bytePrefix(bytes: Uint8Array): string {
  const values: number[] = [];
  const count = Math.min(5, bytes.length);
  for (let index = 0; index < count; index += 1) {
    values.push(bytes[index] ?? 0);
  }
  return values.join(',');
}

function multipartBoundary(contentType: string): string | null {
  const match = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  const boundary = (match?.[1] ?? match?.[2])?.trim();
  return boundary ? boundary : null;
}

function headerValue(headerText: string, name: string): string {
  const match = new RegExp(`^${name}:\\s*([^\\r\\n]+)`, 'im').exec(headerText);
  return match?.[1]?.trim() ?? '';
}

function filenameFromHeaders(headerText: string): string | null {
  const encoded = /filename\*=(?:UTF-8''|utf-8'')([^;\r\n]+)/i.exec(headerText);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      return encoded[1];
    }
  }
  const quoted = /filename="([^"]*)"/i.exec(headerText);
  if (quoted) return quoted[1] ?? '';
  const plain = /filename=([^;\r\n]+)/i.exec(headerText);
  return plain?.[1]?.trim() ?? null;
}

function multipartFileParts(bytes: Uint8Array, contentType: string): MultipartFilePart[] {
  const boundary = multipartBoundary(contentType);
  if (!boundary) return [];

  const source = Buffer.from(bytes);
  const delimiter = Buffer.from(`--${boundary}`);
  const positions: number[] = [];
  let searchFrom = 0;
  while (searchFrom < source.length) {
    const found = source.indexOf(delimiter, searchFrom);
    if (found === -1) break;
    positions.push(found);
    searchFrom = found + delimiter.length;
  }

  const files: MultipartFilePart[] = [];
  for (let index = 0; index < positions.length; index += 1) {
    const delimiterAt = positions[index] ?? 0;
    let partStart = delimiterAt + delimiter.length;
    if (source[partStart] === 45 && source[partStart + 1] === 45) break;
    if (source[partStart] === 13 && source[partStart + 1] === 10) partStart += 2;
    else if (source[partStart] === 10) partStart += 1;

    const nextDelimiter = positions[index + 1];
    if (nextDelimiter === undefined) break;
    let partEnd = nextDelimiter;
    if (partEnd >= 2 && source[partEnd - 2] === 13 && source[partEnd - 1] === 10) partEnd -= 2;
    else if (partEnd >= 1 && source[partEnd - 1] === 10) partEnd -= 1;
    if (partEnd < partStart) continue;

    const part = source.subarray(partStart, partEnd);
    const headerSeparator = part.indexOf('\r\n\r\n');
    const separatorLength = headerSeparator === -1 ? 2 : 4;
    const headerEnd = headerSeparator === -1 ? part.indexOf('\n\n') : headerSeparator;
    if (headerEnd === -1) continue;

    const headerText = part.subarray(0, headerEnd).toString('latin1');
    const filename = filenameFromHeaders(headerText);
    if (filename === null) continue;

    files.push({
      filename,
      contentType: headerValue(headerText, 'content-type'),
      bytes: part.subarray(headerEnd + separatorLength),
    });
  }
  return files;
}

function logUpload(filename: string, contentType: string, bytes: Uint8Array) {
  const safeName = filename.length > 200 ? `${filename.slice(0, 200)}…` : filename;
  const safeType = contentType.length > 120 ? `${contentType.slice(0, 120)}…` : contentType;
  console.info(
    `forwarding upload filename=${JSON.stringify(safeName)} content-type=${JSON.stringify(safeType)} bytes=${bytes.length} prefix=${bytePrefix(bytes)}`,
  );
}

function logMultipartUpload(bytes: Uint8Array, contentType: string) {
  let files: MultipartFilePart[] = [];
  try {
    files = multipartFileParts(bytes, contentType);
  } catch {
    files = [];
  }

  if (files.length === 0) {
    console.info(`forwarding upload bytes=${bytes.length} prefix=${bytePrefix(bytes)}`);
    return;
  }

  for (const file of files) {
    logUpload(file.filename, file.contentType, file.bytes);
  }
}

export async function prepareUpstreamBody(request: Request): Promise<PreparedUpstreamBody> {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') return {};

  const contentType = request.headers.get('content-type') ?? '';
  const body = await request.arrayBuffer();

  // Forward the original multipart bytes. Rebuilding FormData copies each file
  // through a new Blob and can change PDF bytes that the backend then rejects.
  if (contentType.toLowerCase().startsWith('multipart/form-data')) {
    logMultipartUpload(new Uint8Array(body), contentType);
    return { body, contentType };
  }

  return {
    body,
    contentType: contentType || undefined,
  };
}
