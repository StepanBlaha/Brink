import { createContext, useContext } from "react";

/** Set by `RowPageHost`; rows call it to show their page in place of the list. `origin` gets focus back on close. */
export type OpenRowPage = (rowId: string, title: string, origin?: HTMLElement | null) => void;

export const OpenRowPageContext = createContext<OpenRowPage | null>(null);

export const useOpenRowPage = (): OpenRowPage | null => useContext(OpenRowPageContext);
