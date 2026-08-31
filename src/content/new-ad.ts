import { request } from "./lib/api";
import { CREATE_GAP, MAX_TITLE } from "./lib/config";
import { capacity, realLimits, TARGETS } from "./lib/limits";
import { type Resolved, resolveAll } from "./lib/resolve";
import { chunk, dedupe, fieldValues, sleep, truncate } from "./lib/utils";

const BULK_BUTTONS: [string, string, string][] = [
  [".js-field-channels-wrap", "Bulk add channels", "channels"],
  [".js-field-exclude_channels-wrap", "Bulk add channels", "exclude_channels"],
  [".js-field-user_channels-wrap", "Bulk add channels", "user_channels"],
  [".js-field-exclude_user_channels-wrap", "Bulk add channels", "exclude_user_channels"],
  [".js-field-bots-wrap", "Bulk add bots", "bots"],
  [".js-field-search_queries-wrap", "Bulk add queries", "search_queries"],
];

const FLAGS = [
  "intersect_topics",
  "exclude_politic",
  "only_politic",
  "exclude_crypto",
  "only_crypto",
];

const POPUP_HTML = `
<div class="popup-container alert-popup-container pr-popup-container aj_popup hide js-bulk-add-popup">
  <section class="pr-layer-popup popup-no-close">
    <h3 class="pr-layer-header">Bulk add</h3>
    <form class="pr-form" style="display:block;padding:0">
      <div style="padding:0 20px">
        <div class="form-group">
          <div class="pr-form-control-wrap">
            <textarea class="form-control pr-form-control" name="text" rows="8" dir="auto"
              placeholder="One username or query per line"></textarea>
          </div>
          <div class="pr-form-control-hint js-bulk-add-hint"></div>
        </div>
      </div>
      <div class="pr-form-column">
        <div class="popup-buttons">
          <div class="popup-button popup-cancel-btn">Cancel</div>
          <div class="popup-button submit-form-btn js-bulk-add">Add</div>
        </div>
      </div>
    </form>
  </section>
</div>`;

function bulkButton(label: string, field: string): string {
  return `<div class="form-group-link-wrap js-field-bulk-add-wrap sanim" data-field="${field}">
    <a class="form-group-link link-after js-field-bulk-add">${label}</a>
  </div>`;
}

let started = false;

export const NewAdBulk = {
  destroy() {
    Aj.ajContainer.off("click.rich-new");
    started = false;
  },
  init() {
    if (started) {
      return;
    }
    started = true;

    const cont = Aj.ajContainer;
    realLimits();

    for (const [selector, label, field] of BULK_BUTTONS) {
      const $wrap = $(selector);
      if ($wrap.length && !$wrap.next(".js-field-bulk-add-wrap").length) {
        $wrap.after(bulkButton(label, field));
      }
    }

    if (!$(".js-bulk-add-popup", cont).length) {
      cont.append(POPUP_HTML);
    }
    Aj.state.bulkAddPopup = $(".js-bulk-add-popup", cont);

    cont.off("click.rich-new", ".js-field-bulk-add");
    cont.on("click.rich-new", ".js-field-bulk-add", openBulkAdd);

    cont.off("click.curPage", ".create-new-ad-btn", NewAd.eSubmitForm);
    cont.off("click.rich-new", ".create-new-ad-btn");
    cont.on("click.rich-new", ".create-new-ad-btn", submitForm);
  },
};

function openBulkAdd(this: any, event: any) {
  event.preventDefault();

  const field = $(this).parents(".js-field-bulk-add-wrap").attr("data-field");
  const $popup = Aj.state.bulkAddPopup;
  $popup.find('textarea[name="text"]').val("");

  const target = Object.values(TARGETS).find((t) => t.field === field);
  const hint = target
    ? `Max ${realLimits()[target.limit]} per ad. Longer lists are split into several ads.`
    : "";
  $popup.find(".js-bulk-add-hint").text(hint);

  openPopup($popup, {
    closeByClickOutside: ".popup-no-close",
    onClose(this: any) {
      $(".js-bulk-add", this).off("click.rich-new", bulkAdd);
    },
    onOpen(this: any) {
      $(".js-bulk-add", this).data("field", field).text("Add").on("click.rich-new", bulkAdd);
    },
  });
}

async function bulkAdd(this: any) {
  const $button = $(this);
  if ($button.data("busy")) {
    return;
  }

  const $popup = Aj.state.bulkAddPopup;
  const $textarea = $popup.find('textarea[name="text"]');
  const $hint = $popup.find(".js-bulk-add-hint");
  const field = $button.data("field");

  const lines = dedupe(field, String($textarea.val() || "").split(/[\r\n]+/));
  if (!lines.length) {
    $hint.text("Nothing to add.");
    return;
  }

  $button.data("busy", true).prop("disabled", true).addClass("disabled dots-animated");

  let results: Resolved[];
  try {
    results = await resolveAll(field, lines, (done, total) => {
      $button.text(`Adding ${done}/${total}`);
    });
  } finally {
    $button
      .data("busy", false)
      .prop("disabled", false)
      .removeClass("disabled dots-animated")
      .text("Add");
  }

  const failed = results.filter((r) => !r.ok);
  if (!failed.length) {
    closePopup($popup);
    return;
  }

  // Put the failures back in the box so they can be fixed and retried.
  $textarea.val(failed.map((f) => f.line).join("\n"));
  $hint.text(
    `${results.length - failed.length} added, ${failed.length} failed. First error: ${failed[0].error}`,
  );
}

function collectParams($form: any, targetType: string) {
  const params: any = {
    active: $form.field("active").value(),
    ad_info: $form.field("ad_info").value(),
    budget: Ads.amountFieldValue($form, "budget"),
    button: $form.field("button").data("value"),
    cpm: Ads.amountFieldValue($form, "cpm"),
    daily_budget: Ads.amountFieldValue($form, "daily_budget"),
    device: $form.field("device").data("value"),
    media: $form.field("media").value(),
    owner_id: Aj.state.ownerId,
    placement: $form.field("placement").value(),
    promote_url: $form.field("promote_url").value(),
    target_type: targetType,
    text: $form.field("text").value(),
    title: $form.field("title").value(),
    views_per_user: $form.field("views_per_user").value(),
    website_name: $form.field("website_name").value(),
    website_photo: $form.field("website_photo").value(),
  };

  if ($form.field("picture").prop("checked")) {
    params.picture = 1;
  }

  for (const select of Aj.state.selectList || []) {
    const values = fieldValues($form, select.field);
    params[select.field] = select.single_value ? values : values.join(";");
  }

  for (const flag of FLAGS) {
    if ($form.field(flag).prop("checked")) {
      params[flag] = 1;
    }
  }

  const activate = Ads.dateTimeFieldValue($form, "ad_activate_date", "ad_activate_time");
  const deactivate = Ads.dateTimeFieldValue($form, "ad_deactivate_date", "ad_deactivate_time");
  if (activate) {
    params.activate_date = activate;
  }
  if (deactivate) {
    params.deactivate_date = deactivate;
  }

  if ($form.field("use_schedule").prop("checked")) {
    params.schedule = $form.field("schedule").value();
    params.schedule_tz_custom = $form.field("schedule_tz_custom").value();
    params.schedule_tz = $form.field("schedule_tz").value();
  }

  return params;
}

function validate($form: any): boolean {
  const checks: [string, boolean][] = [
    ["title", !$form.field("title").value().length],
    ["promote_url", !$form.field("promote_url").value().length],
    ["cpm", Ads.amountFieldValue($form, "cpm") === false],
    ["budget", Ads.amountFieldValue($form, "budget") === false],
    ["daily_budget", Ads.amountFieldValue($form, "daily_budget") === false],
  ];
  for (const [field, invalid] of checks) {
    if (invalid) {
      $form.field(field).focus();
      return false;
    }
  }
  return true;
}

async function submitForm(this: any, event: any) {
  event.preventDefault();

  const $form = Aj.state.$form;
  const $button = $(this);
  if ($button.data("busy") || !validate($form)) {
    return false;
  }

  const targetType = $form.field("target_type").value();
  const params = collectParams($form, targetType);

  const cap = capacity($form, targetType);
  if (cap && cap.limit < 1) {
    showAlert("Your exclusions use the whole per-ad quota. Remove some and try again.");
    return false;
  }

  const targets = cap ? fieldValues($form, cap.field) : [];
  const batches = cap && targets.length > cap.limit ? chunk(targets, cap.limit) : [];
  const multi = batches.length > 1;

  if (multi) {
    const total = (params.budget * batches.length).toFixed(2);
    const ok = confirm(
      `This creates ${batches.length} ads.\n\nBudget is per ad: ${params.budget} x ${batches.length} = ${total}\n\nContinue?`,
    );
    if (!ok) {
      return false;
    }
  }

  NewAd.saveDraftAuto(true);
  const label = $button.text();
  $button.data("busy", true).prop("disabled", true);

  let created = 0;
  let last: any = null;
  let failure: any = null;

  try {
    const runs = multi ? batches : [null];
    for (let i = 0; i < runs.length; i++) {
      const batch = runs[i];
      const body = { ...params };

      if (batch && cap) {
        body[cap.field] = batch.join(";");
        body.title = truncate(`${params.title} #${i + 1}`, MAX_TITLE);
        $button.text(`Creating ${i + 1}/${runs.length}`);
      }

      last = await request("createAd", body);
      if (last.error) {
        failure = { index: i + 1, total: runs.length, ...last };
        break;
      }

      created++;
      if (i < runs.length - 1) {
        await sleep(CREATE_GAP);
      }
    }
  } finally {
    $button.data("busy", false).prop("disabled", false).text(label);
  }

  if (failure) {
    const prefix = multi
      ? `Ad ${failure.index} of ${failure.total} failed after ${created} were created. `
      : "";
    const $field = failure.field && $form.field(failure.field);
    if ($field?.size()) {
      Ads.showFieldError($field, prefix + failure.error, true);
    } else {
      showAlert(prefix + failure.error);
    }
    return false;
  }

  // Only clear the draft once every ad went through.
  Aj.state.initFormData = NewAd.getFormData($form);
  NewAd.saveDraftAuto(true);

  if (multi) {
    showAlert(`${created} ads created.`);
  }
  if (last?.redirect_to) {
    Aj.location(last.redirect_to);
  }
  return false;
}
