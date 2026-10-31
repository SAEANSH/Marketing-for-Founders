import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeHighlight from "rehype-highlight";
import { rewriteImage, rewriteLink, type LinkContext } from "@/lib/links";

type Props = { markdown: string; ctx: LinkContext };

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

export default function Markdown({ markdown, ctx }: Props) {
  const components: Components = {
    a({ href, children, ...props }) {
      const target = href ? rewriteLink(href, ctx) : "";
      const external = ABSOLUTE.test(target);
      return (
        <a
          href={target}
          {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
          {...props}
        >
          {children}
        </a>
      );
    },
    img({ src, alt, ...props }) {
      const resolved = typeof src === "string" ? rewriteImage(src, ctx) : src;
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={resolved} alt={alt ?? ""} loading="lazy" {...props} />;
    },
    table({ children, ...props }) {
      return (
        <div className="table-wrap">
          <table {...props}>{children}</table>
        </div>
      );
    },
  };

  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeSlug,
          [rehypeAutolinkHeadings, { behavior: "append", properties: { className: "heading-anchor" } }],
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
        ]}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
