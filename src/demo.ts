import type { Book } from "./model";
import { documentSignature } from "./toc/generate";

const legacySample = "/legacy/sample-v1.pdf";

async function fetchSample(path: string): Promise<Uint8Array> {
  const response = await fetch(path);
  if (!response.ok) throw new Error("示例教材不可用");
  return new Uint8Array(await response.arrayBuffer());
}

/** Old demo books keep their original PDF bytes so saved coordinates/IDs stay valid. */
export async function readDemo(
  book?: Pick<Book, "documentSignature">,
): Promise<Uint8Array> {
  if (book && !book.documentSignature) return fetchSample(legacySample);
  const current = await fetchSample("/sample.pdf");
  if (book && book.documentSignature !== (await documentSignature(current)))
    return fetchSample(legacySample);
  return current;
}
