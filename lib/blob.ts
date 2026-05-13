/**
 * Vercel Blob wrapper.
 *
 * Two upload paths:
 *   1. `putBlob(name, buffer)` — direct upload from server (e.g. AI image
 *      generation that returns a buffer or URL we re-stream).
 *   2. `/api/media/upload` route — multipart from the browser.
 *
 * Files are namespaced under `clients/<clientId>/<contentItemId>/<basename>`
 * so a client's storage is easy to enumerate (or wipe) later.
 *
 * BLOB_READ_WRITE_TOKEN comes from Vercel automatically when the project
 * is linked to a Blob store. The first time the operator hits an upload
 * endpoint without a configured store, we surface a clear error.
 */
import { put } from '@vercel/blob';

export type UploadResult = {
  url: string;
  pathname: string;
  contentType: string;
};

export type PutOptions = {
  contentType?: string;
  addRandomSuffix?: boolean;
};

export async function putBlob(
  pathname: string,
  data: Blob | ArrayBuffer | Buffer | ReadableStream,
  options: PutOptions = {},
): Promise<UploadResult> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('Vercel Blob store not configured. Link one in the Vercel dashboard.');
  }
  const blob = await put(pathname, data as Buffer, {
    access: 'public',
    addRandomSuffix: options.addRandomSuffix ?? true,
    contentType: options.contentType,
  });
  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType: blob.contentType ?? 'application/octet-stream',
  };
}

export function pathFor({ clientId, contentItemId, name }: { clientId: string; contentItemId?: string; name: string }): string {
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const parts = ['clients', clientId];
  if (contentItemId) parts.push(contentItemId);
  parts.push(safeName);
  return parts.join('/');
}
