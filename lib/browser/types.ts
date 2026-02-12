export type BrowserTarget = {
  tabId: number;
  attached: boolean;
};

export type CdpCommandResult<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
};

export type ElementInfo = {
  objectId: string;
  nodeId?: number;
  className?: string;
  tagName?: string;
};

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};
