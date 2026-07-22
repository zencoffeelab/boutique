export function ContentBlocks({ blocks }: { blocks?: Array<{ type: "paragraph"; content: string }> | null }) {
  if (!blocks?.length) return null;
  return <section className="article-body cms-content" aria-label="Contenu éditorial">{blocks.map((block, index) => block.type === "paragraph" ? <p key={`${index}:${block.content.slice(0, 20)}`}>{block.content}</p> : null)}</section>;
}
