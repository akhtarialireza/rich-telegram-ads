import { type ApiResult, request } from "./lib/api";
import { ACTION_GAP, DELETE_GAP } from "./lib/config";
import { sleep } from "./lib/utils";

type Report = { ok: number; failed: { id: string; error: string }[] };
type Log = (done: number, total: number, line: string, isError: boolean) => void;

const POPUP_HTML = `
<div class="popup-container alert-popup-container pr-popup-container aj_popup hide js-bulk-action-popup">
  <section class="pr-layer-popup popup-no-close">
    <h3 class="pr-layer-header">Bulk action</h3>
    <form class="pr-form" style="display:block;padding:0">
      <div style="padding:0 20px">
        <div class="form-group">
          <label class="form-label">Action</label>
          <div class="pr-form-control-wrap">
            <select class="form-control pr-form-control js-bulk-action-type">
              <option value="incr">Add to budget</option>
              <option value="decr">Withdraw from budget</option>
              <option value="active">Set status: Active</option>
              <option value="hold">Set status: On Hold</option>
              <option value="delete">Delete ads</option>
            </select>
          </div>
        </div>
        <div class="form-group js-bulk-amount-wrap">
          <label class="form-label">Amount per ad</label>
          <div class="pr-form-control-wrap">
            <input class="form-control pr-form-control js-bulk-amount" inputmode="decimal"
              placeholder="0.00" autocomplete="off" />
          </div>
        </div>
        <div class="pr-form-info-block js-bulk-summary"></div>
        <div class="js-bulk-log" style="max-height:180px;overflow:auto;font:11px/1.5 monospace;margin-top:8px"></div>
      </div>
      <div class="pr-form-column">
        <div class="popup-buttons">
          <div class="popup-button popup-cancel-btn">Cancel</div>
          <div class="popup-button submit-form-btn js-bulk-run">Run</div>
        </div>
      </div>
    </form>
  </section>
</div>`;

const selected = new Set<string>();
let started = false;
let pending = false;
let observer: MutationObserver | null = null;

export const OwnerBulk = {
  decorate,

  destroy() {
    observer?.disconnect();
    observer = null;
    Aj.ajContainer.off("click.rich-owner").off("change.rich-owner");
    selected.clear();
    started = false;
  },
  init() {
    if (started) {
      return;
    }
    started = true;

    const cont = Aj.ajContainer;
    if (!$(".js-bulk-action-popup", cont).length) {
      cont.append(POPUP_HTML);
    }
    Aj.state.bulkActionPopup = $(".js-bulk-action-popup", cont);

    decorate();

    cont.off("click.rich-owner").off("change.rich-owner");
    cont.on("click.rich-owner", ".js-do-bulk-action", openActions);
    cont.on("change.rich-owner", ".js-bulk-cb", toggleRow);
    cont.on("change.rich-owner", ".js-bulk-all", toggleAll);

    // Rows are rendered after page load and again on every sort, search and
    // load-more, so watch the whole container. decorate() is cheap and skips
    // rows it already handled.
    const root = Aj.ajContainer[0];
    if (root) {
      observer = new MutationObserver(() => {
        if (pending) {
          return;
        }
        pending = true;
        setTimeout(() => {
          pending = false;
          decorate();
        }, 50);
      });
      observer.observe(root, { childList: true, subtree: true });
    }
  },
};

function decorate() {
  const $table = $(".js-ads-table");
  if (!$table.length) {
    return;
  }

  if (!$(".js-do-bulk-action").length) {
    const button = '<a class="btn pr-btn js-do-bulk-action">Bulk action (0)</a>';
    const $bar = $(".pr-buttons-wrap");
    if ($bar.length) {
      $bar.append(button);
    } else {
      $table.before(`<div class="pr-buttons-wrap">${button}</div>`);
    }
  }

  const $head = $table.find("thead > tr").first();
  if (!$head.find(".js-bulk-head").length) {
    $head.prepend(
      '<th class="js-bulk-head" style="width:28px"><input type="checkbox" class="checkbox js-bulk-all" /></th>',
    );
  }

  $table.find("tbody > tr").each(function (this: any) {
    const $row = $(this);
    if ($row.find(".js-bulk-cell").length) {
      return;
    }

    const href = $row.find('a[href*="/account/ad/"]').first().attr("href");
    const id = $row.attr("data-ad-id") || href?.match(/\/account\/ad\/(\d+)/)?.[1];
    if (!id) {
      $row.prepend('<td class="js-bulk-cell"></td>');
      return;
    }

    const checked = selected.has(id) ? " checked" : "";
    $row.prepend(
      `<td class="js-bulk-cell"><input type="checkbox" class="checkbox js-bulk-cb" value="${id}"${checked} /></td>`,
    );
  });

  refresh();
}

function refresh() {
  $(".js-do-bulk-action")
    .text(`Bulk action (${selected.size})`)
    .toggleClass("disabled", selected.size === 0);

  const $boxes = $(".js-bulk-cb");
  $(".js-bulk-all").prop(
    "checked",
    $boxes.length > 0 && $boxes.filter(":checked").length === $boxes.length,
  );
}

function toggleRow(this: any) {
  const id = $(this).val();
  if ($(this).prop("checked")) {
    selected.add(id);
  } else {
    selected.delete(id);
  }
  refresh();
}

function toggleAll(this: any) {
  const on = $(this).prop("checked");
  $(".js-bulk-cb").each(function (this: any) {
    $(this).prop("checked", on);
    if (on) {
      selected.add($(this).val());
    } else {
      selected.delete($(this).val());
    }
  });
  refresh();
}

function openActions(this: any, event: any) {
  event.preventDefault();
  if (!selected.size) {
    showAlert("Select at least one ad first.");
    return;
  }

  const $popup = Aj.state.bulkActionPopup;
  $popup.find(".js-bulk-log").html("");
  $popup.find(".js-bulk-amount").val("");

  openPopup($popup, {
    closeByClickOutside: ".popup-no-close",
    onClose(this: any) {
      $(this).find(".js-bulk-run").off("click.rich-owner");
    },
    onOpen(this: any) {
      const $p = $(this);
      $p.find(".js-bulk-action-type").off("change.rich-owner").on("change.rich-owner", syncSummary);
      $p.find(".js-bulk-amount").off("input.rich-owner").on("input.rich-owner", syncSummary);
      $p.find(".js-bulk-run").off("click.rich-owner").on("click.rich-owner", runAction).text("Run");
      syncSummary();
    },
  });
}

function syncSummary() {
  const $popup = Aj.state.bulkActionPopup;
  const type = $popup.find(".js-bulk-action-type").val();
  const amount = Number.parseFloat($popup.find(".js-bulk-amount").val()) || 0;
  const count = selected.size;
  const needsAmount = type === "incr" || type === "decr";

  $popup.find(".js-bulk-amount-wrap").toggle(needsAmount);

  let summary: string;
  if (type === "delete") {
    summary = `Delete ${count} ads. This cannot be undone.`;
  } else if (needsAmount) {
    const verb = type === "incr" ? "Add" : "Withdraw";
    summary = `${verb} ${amount.toFixed(2)} on each of ${count} ads — total ${(amount * count).toFixed(2)}`;
  } else {
    summary = `Set ${count} ads to ${type === "active" ? "Active" : "On Hold"}.`;
  }
  $popup.find(".js-bulk-summary").text(summary);
}

async function runAction(this: any) {
  const $button = $(this);
  if ($button.data("busy")) {
    return;
  }

  const $popup = Aj.state.bulkActionPopup;
  const type = $popup.find(".js-bulk-action-type").val();
  const amount = Number.parseFloat($popup.find(".js-bulk-amount").val());
  const ids = [...selected];

  if ((type === "incr" || type === "decr") && !(amount > 0)) {
    $popup.find(".js-bulk-amount").focus();
    showAlert("Enter an amount greater than zero.");
    return;
  }
  if (!confirm(`${$popup.find(".js-bulk-summary").text()}\n\nContinue?`)) {
    return;
  }

  const log: Log = (done, total, line, isError) => {
    $button.text(`${done}/${total}`);
    const color = isError ? "#e53935" : "#707579";
    const $log = $popup.find(".js-bulk-log");
    $log.append(`<div style="color:${color}">${$("<div>").text(line).html()}</div>`);
    $log[0].scrollTop = $log[0].scrollHeight;
  };

  $button.data("busy", true).prop("disabled", true).addClass("disabled");
  let report: Report;
  try {
    if (type === "incr") {
      report = await changeBudget(ids, amount, false, log);
    } else if (type === "decr") {
      report = await changeBudget(ids, amount, true, log);
    } else if (type === "delete") {
      report = await deleteAds(ids, log);
    } else {
      report = await setStatus(ids, type === "active" ? "1" : "0", log);
    }
  } finally {
    $button.data("busy", false).prop("disabled", false).removeClass("disabled").text("Run");
  }

  refresh();
  const first = report.failed.length ? `\n\nFirst error: ${report.failed[0].error}` : "";
  showAlert(`${report.ok} succeeded, ${report.failed.length} failed.${first}`);
}

// One ad at a time. These cost money, and parallel bursts get rate limited.
async function eachAd(
  ids: string[],
  gap: number,
  log: Log | undefined,
  run: (id: string) => Promise<ApiResult>,
): Promise<Report> {
  const report: Report = { failed: [], ok: 0 };

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    let result: ApiResult;
    try {
      result = await run(id);
    } catch (err: any) {
      result = { error: String(err?.message || err) };
    }

    if (result.error) {
      report.failed.push({ error: result.error, id });
      log?.(i + 1, ids.length, `ad ${id}: ${result.error}`, true);
    } else {
      report.ok++;
      log?.(i + 1, ids.length, `ad ${id}: ok`, false);
    }

    if (i < ids.length - 1) {
      await sleep(gap);
    }
  }
  return report;
}

function applyResult(result: ApiResult) {
  if (result.ad) {
    OwnerAds.updateAd(result.ad);
  }
  if (result.header_owner_budget) {
    $(".js-header_owner_budget").html(result.header_owner_budget);
  }
  if (result.owner_budget) {
    $(".js-owner_budget").html(result.owner_budget);
  }
}

function changeBudget(ids: string[], amount: number, withdraw: boolean, log?: Log) {
  const method = withdraw ? "decrAdBudget" : "incrAdBudget";
  return eachAd(ids, ACTION_GAP, log, async (ad_id) => {
    // popup:1 makes the response include the updated ad, so the row refreshes.
    const result = await request(method, {
      ad_id,
      amount,
      owner_id: Aj.state.ownerId,
      popup: 1,
    });
    if (!result.error) {
      applyResult(result);
    }
    return result;
  });
}

function setStatus(ids: string[], active: string, log?: Log) {
  return eachAd(ids, ACTION_GAP, log, async (ad_id) => {
    const result = await request("editAdStatus", {
      active,
      ad_id,
      owner_id: Aj.state.ownerId,
    });
    if (!result.error) {
      applyResult(result);
    }
    return result;
  });
}

function deleteAds(ids: string[], log?: Log) {
  return eachAd(ids, DELETE_GAP, log, async (ad_id) => {
    const params: any = { ad_id, owner_id: Aj.state.ownerId };

    // deleteAd answers with a confirm_hash first; only the second call deletes.
    let result = await request("deleteAd", params);
    if (result.error) {
      return result;
    }
    if (result.confirm_text && result.confirm_hash) {
      params.confirm_hash = result.confirm_hash;
      result = await request("deleteAd", params);
      if (result.error) {
        return result;
      }
    }

    removeRow(ad_id);
    selected.delete(ad_id);
    return result;
  });
}

function removeRow(ad_id: string) {
  $(".js-ads-table tbody tr")
    .filter(function (this: any) {
      return $(this).find(".js-bulk-cb").val() === ad_id;
    })
    .remove();

  const list = Aj.state?.adsList;
  if (!list) {
    return;
  }
  const index = list.findIndex((ad: any) => String(ad.ad_id) === String(ad_id));
  if (index >= 0) {
    list.splice(index, 1);
    OwnerAds.updateAdsList();
    Aj.state.$searchField?.trigger("contentchange");
  }
}
