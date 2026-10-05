import { Plugin } from "prosemirror-state";
import { hasText } from "../../domain/markdown/paragraphKind";
import { kindOf } from "../schema";

/** Typing into token / image / divider lines is rejected unless it replaces the whole line (ETV L40-47). */
export const atomicGuard = (): Plugin =>
  new Plugin({
    props: {
      handleTextInput(view, from, to) {
        const $from = view.state.doc.resolve(from);
        const block = $from.node(1);
        if (hasText(kindOf(block))) return false;
        const start = $from.start(1);
        const whole = block.content.size > 0 && from === start && to === start + block.content.size;
        return !whole;
      },
    },
  });
