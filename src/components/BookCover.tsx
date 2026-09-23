import { useEffect, useRef, useState } from "react";
import type { Book } from "../model";
import { coverKey, forgetCover } from "../cover-cache";
import { getCover } from "../covers";

export default function BookCover({
  book,
  number,
  disabled,
}: {
  book: Book;
  number: number;
  disabled: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [image, setImage] = useState<{ key: string; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const key = coverKey(book);
  useEffect(() => {
    const node = host.current!;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { root: node.closest(".archive-main"), rootMargin: "100px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || disabled) return;
    const controller = new AbortController();
    let url: string | undefined;
    setFailed(false);
    void getCover(book, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setImage({ key, url });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
      setImage(null);
    };
  }, [key, visible, disabled, book.path]);
  return (
    <div ref={host} className="archive-art cover-stage">
      <span className="cover-index">
        RA / {String(number).padStart(3, "0")}
      </span>
      {image?.key === key ? (
        <img
          className="cover-image"
          src={image.url}
          alt={`${book.title}封面`}
          onError={() => {
            void forgetCover(key).catch(() => {});
            setImage(null);
            setFailed(true);
          }}
        />
      ) : (
        <div
          className="cover-fallback"
          aria-label={failed ? "暂无封面，打开 PDF 后可重试" : "封面待生成"}
        >
          <span>RHINE ARCHIVE</span>
          <b>{book.title}</b>
          <span>{failed ? "暂无封面" : "PDF"}</span>
        </div>
      )}
      <i className="cover-tick" aria-hidden="true" />
      <span className="cover-page">
        {failed ? "打开 PDF 后重试" : `封面 · 第 ${book.coverPage || 1} 页`}
      </span>
    </div>
  );
}
