export async function parseJson(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  try {
    const reader = request.body?.getReader();
    if (!reader)
      return { ok: false, error: 'Request body must contain valid JSON.' };
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 16_384) {
        await reader.cancel();
        return { ok: false, error: 'Request body exceeds 16 KiB.' };
      }
      chunks.push(chunk.value);
    }
    return {
      ok: true,
      value: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
    };
  } catch {
    return { ok: false, error: 'Request body must contain valid JSON.' };
  }
}
