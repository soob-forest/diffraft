import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function safePreviewUrl(href: string): string {
  if (href.startsWith("#")) return href;
  if (
    [...href].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return "";
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}

export default function Preview({
  content,
  onOpen,
}: {
  content: string;
  onOpen: (url: string) => void;
}) {
  return (
    <article className="markdown-preview" aria-label="문서 미리보기">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={safePreviewUrl}
        components={{
          img: ({ alt }) => (
            <span className="image-placeholder">
              [이미지: {alt || "대체 텍스트 없음"}]
            </span>
          ),
          a: ({ href, children }) =>
            !href ? (
              <span>{children}</span>
            ) : (
              <a
                href={href}
                onClick={(event) => {
                  if (href.startsWith("#")) return;
                  event.preventDefault();
                  onOpen(href);
                }}
              >
                {children}
              </a>
            ),
        }}
      >
        {content}
      </Markdown>
    </article>
  );
}
