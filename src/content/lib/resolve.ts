import { request } from "./api";
import { RESOLVE_CONCURRENCY, RESOLVE_GAP, RESOLVE_RETRIES, RETRY_DELAY } from "./config";
import { sleep } from "./utils";

export type Resolved = { line: string; ok: boolean; error: string };

const METHODS: Record<string, { method: string; key: string; ownerId: boolean }> = {
  bots: { key: "bot", method: "searchBot", ownerId: false },
  channels: { key: "channel", method: "searchChannel", ownerId: true },
  exclude_channels: { key: "channel", method: "searchChannel", ownerId: true },
  exclude_user_channels: {
    key: "channel",
    method: "searchChannel",
    ownerId: true,
  },
  search_queries: { key: "query", method: "searchTargetQuery", ownerId: false },
  user_channels: { key: "channel", method: "searchChannel", ownerId: true },
};

function isTransient(error: string): boolean {
  return /timeout|too many|try again|network|temporar/i.test(error);
}

async function resolveOne(field: string, line: string): Promise<Resolved> {
  const config = METHODS[field];
  if (!config) {
    return { error: "Unsupported field", line, ok: false };
  }

  const $field = Aj.state.$form.field(field);
  const $group = $field.fieldEl().parents(".form-group");
  const params: any = { field, query: line };
  if (config.ownerId) {
    params.owner_id = Aj.state.ownerId;
  }

  $group.addClass("field-loading");
  try {
    for (let attempt = 0; attempt <= RESOLVE_RETRIES; attempt++) {
      const result = await request(config.method, params);

      if (result.error) {
        if (isTransient(result.error) && attempt < RESOLVE_RETRIES) {
          await sleep(RETRY_DELAY * (attempt + 1));
          continue;
        }
        return { error: result.error, line, ok: false };
      }

      let item = result[config.key];
      if (!item) {
        return { error: "Not found", line, ok: false };
      }

      if (field === "search_queries") {
        item = {
          name: item.title,
          sample_results: item.sample_results,
          val: item.id,
        };
        NewAd.updateAdSampleResults(item);
      }

      $field.trigger("selectval", [item, true]);
      return { error: "", line, ok: true };
    }
    return { error: "Failed after retries", line, ok: false };
  } finally {
    $group.removeClass("field-loading");
    $field.data("prevval", "");
  }
}

type Progress = (done: number, total: number) => void;

export async function resolveAll(field: string, lines: string[], onProgress?: Progress) {
  const results: Resolved[] = new Array(lines.length);
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < lines.length) {
      const i = next++;
      results[i] = await resolveOne(field, lines[i]);
      onProgress?.(++done, lines.length);
      await sleep(RESOLVE_GAP);
    }
  }

  const workers = Array.from({ length: Math.min(RESOLVE_CONCURRENCY, lines.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
}
