export type EditorState = {
  currentFileId: string | null;
  currentFileName: string;
  content: string;
  dirty: boolean;
};

export const initialEditorState: EditorState = {
  currentFileId: null,
  currentFileName: "untitled.feature",
  content: "",
  dirty: false,
};
