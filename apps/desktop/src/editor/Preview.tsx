import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  type PreviewJump,
  previewHeadingPositions,
  usePreviewNavigation,
} from "./preview-navigation";

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
  jump,
  onJumpHandled,
}: {
  content: string;
  onOpen: (url: string) => void;
  jump?: PreviewJump | null;
  onJumpHandled?: () => void;
}) {
  const { root, notice } = usePreviewNavigation({
    jump,
    handled: onJumpHandled,
  });
  return (
    <article ref={root} className="markdown-preview" aria-label="문서 미리보기">
      {notice && (
        <p
          role="status"
          tabIndex={-1}
          className="preview-navigation-notice error-banner"
        >
          {notice}
        </p>
      )}
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[previewHeadingPositions]}
        skipHtml
        urlTransform={safePreviewUrl}
        components={previewComponents(onOpen)}
      >
        {content}
      </Markdown>
    </article>
  );
}

function previewComponents(
  onOpen: (url: string) => void,
): import("react-markdown").Components {
  return {
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
  };
}
