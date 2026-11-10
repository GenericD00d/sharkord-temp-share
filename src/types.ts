/** one shared file, as the server keeps it */
type TShare = {
  token: string;
  name: string;
  size: number;
  /** bytes written so far, equal to size once ready */
  received: number;
  ready: boolean;
  uploaderId: number;
  channelId: number;
  hours: number;
  downloadsLeft: number;
  /**
   * download ticket id to its expiry. pressing Download spends one use and
   * issues a ticket, and the ticket url can then be resumed freely until it expires
   */
  tickets: Record<string, number>;
  /** set when the upload finishes, so slow uploads do not eat the lifetime */
  expiresAt: number;
  updatedAt: number;
  messageId?: number;
};

/** what clients see of a share, safe to put in message props */
type TShareCard = Pick<
  TShare,
  "token" | "name" | "size" | "expiresAt" | "downloadsLeft" | "uploaderId"
>;

type TShareListItem = TShareCard & { channelId: number; ready: boolean };

type TPlugin = {
  actions: {
    start: {
      payload: {
        channelId: number;
        name: string;
        size: number;
        hours: number;
        downloads: number;
      };
      response: { token: string; chunkBytes: number };
    };
    delete: { payload: { token: string }; response: void };
    list: {
      payload: Record<string, never>;
      response: {
        usedBytes: number;
        limitBytes: number;
        shares: TShareListItem[];
      };
    };
  };
};

export type { TPlugin, TShare, TShareCard, TShareListItem };
