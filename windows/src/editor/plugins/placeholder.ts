import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { apiType } from "../../domain/markdown/paragraphKind";
import { kindOf } from "../schema";

const key = new PluginKey<boolean>("brinkPlaceholder");

const texts: Record<string, string> = {
  paragraph: "Type '/' for commands", heading_1: "Heading 1", heading_2: "Heading 2", heading_3: "Heading 3",
  to_do: "To-do", bulleted_list_item: "List", numbered_list_item: "List", quote: "Quote", toggle: "Toggle",
  callout: "Callout", code: "Code",
};

/** Only the caret's empty block, when focused and nothing is selected. */
export const placeholderPlugin = (): Plugin<boolean> =>
  new Plugin<boolean>({
    key,
    state: {
      init: () => false,
      apply: (tr, focused) => (tr.getMeta(key) as boolean | undefined) ?? focused,
    },
    props: {
      handleDOMEvents: {
        focus: (view) => { view.dispatch(view.state.tr.setMeta(key, true)); return false; },
        blur: (view) => { view.dispatch(view.state.tr.setMeta(key, false)); return false; },
      },
      decorations(state) {
        if (!key.getState(state) || !state.selection.empty) return null;
        const { $from } = state.selection;
        const block = $from.node(1);
        if (block.content.size > 0) return null;
        const text = texts[apiType(kindOf(block))];
        if (!text) return null;
        const pos = $from.before(1);
        return DecorationSet.create(state.doc, [Decoration.node(pos, pos + block.nodeSize, { class: "ph", "data-placeholder": text })]);
      },
    },
  });
