export type FeatureFile = {
  id: string;
  name: string;
  content: string;
  createdAt: number;
  updatedAt: number;
};

export type FilesState = {
  files: FeatureFile[];
  loading: boolean;
};

export const initialFilesState: FilesState = {
  files: [],
  loading: false,
};
