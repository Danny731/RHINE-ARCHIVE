import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from "pdfjs-dist";
import type { Library } from "./model";
import { cachedFile, desktop, readPdf } from "./storage";
import { cachePageSizes, loadPdf, outlineOf, type Outline } from "./pdf";
import { documentSignature } from "./toc/generate";
import { identifyBook } from "./book-identity";

export type LoadedDocument = {
  pdf: PDFDocumentProxy;
  outline: Outline[];
  labels: string[] | null;
  signature: string;
};
export type PasswordRequest = {
  id: string;
  title: string;
  update: (password: string) => void;
  wrong: boolean;
  cancel: () => void;
};
export function useDocumentPool(
  library: Library,
  visibleIds: string[],
  prompt: (request: PasswordRequest) => void,
  dismiss: (id: string) => void,
) {
  const [documents, setDocuments] = useState<Record<string, LoadedDocument>>(
    {},
  );
  const documentsRef = useRef(documents);
  documentsRef.current = documents;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const tasks = useRef(
    new Map<string, { cancelled: boolean; task?: PDFDocumentLoadingTask }>(),
  );
  const needed = useRef(new Set(visibleIds));
  needed.current = new Set(visibleIds);
  const state = useRef({ library, prompt, dismiss });
  state.current = { library, prompt, dismiss };
  const [retryCount, setRetryCount] = useState(0);
  const key = [...new Set(visibleIds)].sort().join("|");
  function register(
    id: string,
    doc: LoadedDocument,
    owner?: { cancelled: boolean; task?: PDFDocumentLoadingTask },
  ) {
    const loading = tasks.current.get(id);
    if (loading && loading !== owner) {
      loading.cancelled = true;
      void loading.task?.destroy().catch(() => {});
      tasks.current.delete(id);
    }
    const previous = documentsRef.current[id];
    const next = { ...documentsRef.current, [id]: doc };
    documentsRef.current = next;
    setDocuments(next);
    setErrors((old) => {
      const next = { ...old };
      delete next[id];
      return next;
    });
    if (previous && previous.pdf !== doc.pdf)
      setTimeout(
        () => void previous.pdf.loadingTask.destroy().catch(() => {}),
        100,
      );
  }
  useEffect(() => {
    const visible = needed.current;
    for (const [id, task] of tasks.current)
      if (!visible.has(id)) {
        task.cancelled = true;
        void task.task?.destroy().catch(() => {});
        tasks.current.delete(id);
        state.current.dismiss(id);
      }
    const next = { ...documentsRef.current };
    let changed = false;
    for (const [id, doc] of Object.entries(next))
      if (!visible.has(id)) {
        delete next[id];
        changed = true;
        setTimeout(
          () => void doc.pdf.loadingTask.destroy().catch(() => {}),
          100,
        );
      }
    if (changed) {
      documentsRef.current = next;
      setDocuments(next);
    }
    for (const id of visible) {
      if (documentsRef.current[id] || tasks.current.has(id)) continue;
      const book = state.current.library.books.find((b) => b.id === id);
      if (!book) continue;
      const job: { cancelled: boolean; task?: PDFDocumentLoadingTask } = {
        cancelled: false,
      };
      tasks.current.set(id, job);
      setErrors((old) => {
        const next = { ...old };
        delete next[id];
        return next;
      });
      void (async () => {
        let bytes: Uint8Array;
        if (book.source === "demo") {
          const response = await fetch("/sample.pdf");
          if (!response.ok) throw new Error("示例教材不可用");
          bytes = new Uint8Array(await response.arrayBuffer());
        } else if (desktop && book.path) bytes = await readPdf(book.path);
        else {
          const file = await cachedFile(book.id);
          if (!file) throw new Error("原文件不可用，请重新定位 PDF。");
          bytes = new Uint8Array(await file.arrayBuffer());
        }
        if (job.cancelled) return;
        const signature = await documentSignature(bytes);
        if (job.cancelled) return;
        const task = loadPdf(bytes);
        job.task = task;
        task.onPassword = (
          update: (password: string) => void,
          reason: number,
        ) =>
          state.current.prompt({
            id,
            title: book.title,
            update,
            wrong: reason === 2,
            cancel: () => {
              void task.destroy().catch(() => {});
            },
          });
        const pdf = await task.promise;
        identifyBook(
          state.current.library,
          pdf.fingerprints[0] || pdf.fingerprints[1] || "",
          signature,
          pdf.numPages,
          id,
        );
        const [outline, labels] = await Promise.all([
          outlineOf(pdf).catch(() => []),
          pdf.getPageLabels().catch(() => null),
          cachePageSizes(pdf),
        ]);
        if (job.cancelled || !needed.current.has(id)) {
          await task.destroy();
          return;
        }
        register(id, { pdf, outline, labels, signature }, job);
      })()
        .catch((error) => {
          void job.task?.destroy().catch(() => {});
          if (!job.cancelled)
            setErrors((old) => ({ ...old, [id]: String(error) }));
        })
        .finally(() => {
          if (tasks.current.get(id) === job) {
            tasks.current.delete(id);
            state.current.dismiss(id);
          }
        });
    }
  }, [key, retryCount]);
  useEffect(
    () => () => {
      for (const task of tasks.current.values()) {
        task.cancelled = true;
        void task.task?.destroy().catch(() => {});
      }
      for (const doc of Object.values(documentsRef.current))
        setTimeout(
          () => void doc.pdf.loadingTask.destroy().catch(() => {}),
          100,
        );
    },
    [],
  );
  return {
    documents,
    errors,
    register,
    retry: () => setRetryCount((n) => n + 1),
  };
}
