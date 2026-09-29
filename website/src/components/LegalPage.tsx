import { renderLegal, type LegalFile } from "@/lib/legal";
import { Prose } from "./Prose";

export async function LegalPage({ file, title }: { file: LegalFile; title: string }) {
  const html = await renderLegal(file);
  return (
    <Prose title={title}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </Prose>
  );
}
