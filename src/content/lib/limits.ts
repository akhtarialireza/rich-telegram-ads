import { UI_LIMIT } from "./config";
import { fieldValues } from "./utils";

type Target = {
  field: string;
  limit: "searchQuery" | "channel" | "bot";
  exclude?: string;
};

export const TARGETS: Record<string, Target> = {
  bots: { field: "bots", limit: "bot" },
  channels: {
    exclude: "exclude_channels",
    field: "channels",
    limit: "channel",
  },
  search: { field: "search_queries", limit: "searchQuery" },
  users: {
    exclude: "exclude_user_channels",
    field: "user_channels",
    limit: "channel",
  },
};

// The UI limits are raised so the widgets accept long lists. The originals are
// kept because they are what we split on. Read them once, before overwriting.
export function realLimits() {
  if (!Aj.state.__realLimits) {
    Aj.state.__realLimits = {
      bot: Aj.state.botItemsLimit || 100,
      channel: Aj.state.channelItemsLimit || 100,
      searchQuery: Aj.state.searchQueryItemsLimit || 10,
    };
    Aj.state.searchQueryItemsLimit = UI_LIMIT;
    Aj.state.channelItemsLimit = UI_LIMIT;
    Aj.state.botItemsLimit = UI_LIMIT;
  }
  return Aj.state.__realLimits;
}

export function capacity($form: any, targetType: string) {
  const target = TARGETS[targetType];
  if (!target) {
    return null;
  }
  let limit = realLimits()[target.limit];
  if (target.exclude) {
    limit -= fieldValues($form, target.exclude).length;
  }
  return { field: target.field, limit };
}
