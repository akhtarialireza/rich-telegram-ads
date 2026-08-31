import { NewAdBulk } from "./new-ad";
import { OwnerBulk } from "./owner-ads";

function waitForTable(tries = 20) {
  if ($(".js-ads-table").length) {
    OwnerBulk.decorate();
    return;
  }
  if (tries <= 0) {
    console.warn("[rich-telegram-ads] .js-ads-table never appeared");
    return;
  }
  setTimeout(() => waitForTable(tries - 1), 250);
}

function route() {
  const path = Aj.location().pathname;

  if (path === "/account") {
    OwnerBulk.init();
    waitForTable();
  } else {
    OwnerBulk.destroy();
  }

  if (path === "/account/ad/new") {
    NewAdBulk.init();
  } else {
    NewAdBulk.destroy();
  }
}

Aj.ajContainer.on("page:load", route);
route();
