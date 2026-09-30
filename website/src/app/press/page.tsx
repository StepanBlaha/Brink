import { pageMetadata } from "@/lib/metadata";
import { pressJsonLd } from "@/lib/jsonld";
import { site } from "@/site";
import { JsonLd } from "@/components/JsonLd";
import { Prose } from "@/components/Prose";
import { NameUsage } from "@/components/press/NameUsage";
import { Descriptions } from "@/components/press/Descriptions";
import { Downloads } from "@/components/press/Downloads";
import { Colors } from "@/components/press/Colors";
import { Facts } from "@/components/press/Facts";

export const metadata = pageMetadata({
  title: "Press kit: name, icon, colors and facts",
  description: "Brink press kit: how to write the name, taglines, short and long descriptions, icon downloads, color palette and app facts.",
  path: "press/",
  ogTitle: "Brink press kit",
  ogDescription: "Name usage, taglines, descriptions, icon downloads, colors and facts for Brink, the notch app for Mac.",
});

export default function PressPage() {
  return (
    <>
      <JsonLd data={pressJsonLd} />
      <Prose title="Press kit" wide crumb={{ name: "Press kit", path: "press/" }}>
        <p className="lede">
          Everything you need to write about Brink. For anything else, email{" "}
          <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.
        </p>
        <NameUsage />
        <Descriptions />
        <Downloads />
        <Colors />
        <Facts />
      </Prose>
    </>
  );
}
