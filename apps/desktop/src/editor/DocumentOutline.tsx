import { type ComponentProps, createContext, memo, useContext } from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  type PreviewJump,
  previewHeadingPositions,
} from "./preview-navigation";

type Props = {
  content: string;
  disabled: boolean;
  onJump: (jump: PreviewJump) => void;
};
type OutlineNode = {
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: OutlineNode[];
};
const HEADING_TAG = /^h[1-6]$/;
const LEVEL_INDENT = 12;
const BASE_INDENT = 8;
const OutlineContext = createContext<Props | null>(null);

export const DocumentOutline = memo(function DocumentOutline(props: Props) {
  return (
    <OutlineContext value={props}>
      <nav className="outline" aria-label="문서 목차">
        <strong>목차</strong>
        <Markdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[previewHeadingPositions, outlineOnly]}
          skipHtml
          components={outlineComponents}
        >
          {props.content}
        </Markdown>
      </nav>
    </OutlineContext>
  );
});

function outlineOnly() {
  return (tree: OutlineNode) => {
    tree.children = collectHeadings(tree);
  };
}
function collectHeadings(node: OutlineNode): OutlineNode[] {
  const offset = node.properties?.["data-heading-offset"];
  if (
    HEADING_TAG.test(node.tagName ?? "") &&
    typeof offset === "number" &&
    Number.isSafeInteger(offset) &&
    offset >= 0
  )
    return [node];
  return node.children?.flatMap(collectHeadings) ?? [];
}

function HeadingButton({ node, children }: ComponentProps<"h1"> & ExtraProps) {
  const props = useContext(OutlineContext);
  if (!props || !node) return null;
  const offset = Number(node.properties["data-heading-offset"]);
  if (!Number.isSafeInteger(offset) || offset < 0) return null;
  const level = Number(node.tagName.slice(1));
  return (
    <button
      type="button"
      disabled={props.disabled}
      data-heading-offset={offset}
      style={{ paddingLeft: (level - 1) * LEVEL_INDENT + BASE_INDENT }}
      onClick={() => props.onJump({ offset, source: props.content })}
    >
      {children}
    </button>
  );
}
const outlineComponents: Components = {
  h1: HeadingButton,
  h2: HeadingButton,
  h3: HeadingButton,
  h4: HeadingButton,
  h5: HeadingButton,
  h6: HeadingButton,
  a: ({ children }) => <>{children}</>,
  img: ({ alt }) => <>{alt}</>,
};
