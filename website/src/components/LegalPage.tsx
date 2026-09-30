import { renderLegal, type LegalFile } from "@/lib/legal";
import { Prose } from "./Prose";

export async function LegalPage({ file, title, path }: { file: LegalFile; title: string; path: string }) {
  const html = await renderLegal(file);
  return (
    <Prose title={title} crumb={{ name: title, path }}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </Prose>
  );
}
