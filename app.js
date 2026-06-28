const searchInput = document.querySelector("#app-search");
const filterButtons = [...document.querySelectorAll("[data-filter]")];
const cards = [...document.querySelectorAll(".app-card")];
const emptyState = document.querySelector(".empty-state");
const membershipApps = [...document.querySelectorAll("[data-membership-app]")];
const membershipStorageKey = "awesomeDelvelmentRewards";
const accountStorageKey = "awesomeDelvelmentAccountsV1";
const accountSessionKey = "awesomeDelvelmentSessionV1";
const accountTrigger = document.querySelector("[data-account-trigger]");
const accountDialog = document.querySelector("[data-account-dialog]");
const accountClose = document.querySelector("[data-account-close]");
const accountForm = document.querySelector("[data-account-form]");
const accountEmail = document.querySelector("#account-email");
const accountPassword = document.querySelector("#account-password");
const accountSubmit = document.querySelector("[data-account-submit]");
const accountTitle = document.querySelector("[data-account-title]");
const accountMessage = document.querySelector("[data-account-message]");
const accountModeButtons = [...document.querySelectorAll("[data-account-mode]")];
const accountFolder = document.querySelector("[data-account-folder]");
const folderEmail = document.querySelector("[data-folder-email]");
const folderItems = document.querySelector("[data-folder-items]");
const folderEmpty = document.querySelector("[data-folder-empty]");
const signOutButton = document.querySelector("[data-sign-out]");

let activeFilter = "all";
let accountMode = "login";

function readMembership() {
  try {
    const saved = JSON.parse(localStorage.getItem(membershipStorageKey));
    const passClaimed = Boolean(saved?.claimed?.pass);
    const expiresAt = Math.max(0, Number(saved?.passExpiresAt) || 0);
    return {
      active: passClaimed && (!expiresAt || expiresAt > Date.now()),
      expiresAt
    };
  } catch (error) {
    return { active: false, expiresAt: 0 };
  }
}

function formatMembershipDate(timestamp) {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function updateMembershipApps() {
  const membership = readMembership();

  membershipApps.forEach((card) => {
    const status = card.querySelector("[data-membership-status]");
    const copy = card.querySelector("[data-membership-copy]");
    const launch = card.querySelector("[data-membership-launch]");

    card.classList.toggle("membership-locked", !membership.active);
    card.classList.toggle("is-membership-active", membership.active);
    status.textContent = membership.active ? "Member" : "Locked";
    launch.href = membership.active ? launch.dataset.appHref : "rewards.html";
    launch.textContent = membership.active ? "Open" : "Get Pass";

    if (membership.active && membership.expiresAt) {
      copy.textContent = `Membership active until ${formatMembershipDate(membership.expiresAt)}.`;
    } else if (membership.active) {
      copy.textContent = "Membership active. The game is unlocked.";
    } else {
      copy.textContent = "A human social-deduction game available with an active Membership Pass.";
    }
  });
}

function normalize(value) {
  return value.trim().toLowerCase();
}

function readAccounts() {
  try {
    const saved = JSON.parse(localStorage.getItem(accountStorageKey));
    return saved && typeof saved === "object" ? saved : {};
  } catch (error) {
    return {};
  }
}

function writeAccounts(accounts) {
  localStorage.setItem(accountStorageKey, JSON.stringify(accounts));
}

function createSalt() {
  if (window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  return `${Date.now()}-${Math.random()}`;
}

function fallbackHash(value) {
  let first = 2166136261;
  let second = 2246822519;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }

  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

async function hashPassword(password, salt) {
  const value = `${salt}:${password}`;

  if (window.crypto?.subtle && window.TextEncoder) {
    const encoded = new TextEncoder().encode(value);
    const digest = await window.crypto.subtle.digest("SHA-256", encoded);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  return fallbackHash(value);
}

function getSignedInAccount() {
  const email = normalize(localStorage.getItem(accountSessionKey) || "");
  const accounts = readAccounts();

  if (!email || !accounts[email]) {
    if (email) {
      localStorage.removeItem(accountSessionKey);
    }
    return null;
  }

  return accounts[email];
}

function makeAppId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getCardDetails(card) {
  const name = card.querySelector("h2")?.textContent.trim() || "App";
  const launch = card.querySelector(".primary-action");

  return {
    id: card.dataset.accountAppId || makeAppId(name),
    name,
    href: launch?.getAttribute("href") || "index.html"
  };
}

function setAccountMessage(message, success = false) {
  accountMessage.textContent = message;
  accountMessage.classList.toggle("is-success", success);
}

function setAccountMode(mode) {
  accountMode = mode === "create" ? "create" : "login";
  const isCreating = accountMode === "create";

  accountTitle.textContent = isCreating ? "Create account" : "Log in";
  accountSubmit.textContent = isCreating ? "Create account" : "Log in";
  accountPassword.autocomplete = isCreating ? "new-password" : "current-password";
  setAccountMessage("");

  accountModeButtons.forEach((button) => {
    const isActive = button.dataset.accountMode === accountMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
}

function openAccountDialog(mode = "login") {
  setAccountMode(mode);
  accountForm.reset();

  if (typeof accountDialog.showModal === "function") {
    if (!accountDialog.open) {
      accountDialog.showModal();
    }
  } else {
    accountDialog.setAttribute("open", "");
  }

  accountEmail.focus();
}

function closeAccountDialog() {
  if (typeof accountDialog.close === "function" && accountDialog.open) {
    accountDialog.close();
  } else {
    accountDialog.removeAttribute("open");
  }
}

function renderAccountFolder() {
  const account = getSignedInAccount();
  const savedApps = new Set(account?.folderItems || []);

  accountFolder.hidden = !account;
  accountTrigger.textContent = account ? "My Folder" : "Log in";
  accountTrigger.classList.toggle("is-signed-in", Boolean(account));
  accountTrigger.setAttribute("aria-expanded", String(Boolean(account)));

  document.querySelectorAll("[data-folder-action]").forEach((button) => {
    const card = button.closest(".app-card");
    const details = getCardDetails(card);
    const isSaved = savedApps.has(details.id);

    button.textContent = isSaved ? "Remove from Folder" : "Add to Folder";
    button.classList.toggle("is-saved", isSaved);
    button.setAttribute("aria-pressed", String(isSaved));
    button.setAttribute("aria-label", `${isSaved ? "Remove" : "Add"} ${details.name} ${isSaved ? "from" : "to"} your folder`);
  });

  if (!account) {
    folderItems.replaceChildren();
    return;
  }

  folderEmail.textContent = account.email;
  const shortcuts = cards
    .map((card) => getCardDetails(card))
    .filter((app) => savedApps.has(app.id));

  const shortcutElements = shortcuts.map((app) => {
    const shortcut = document.createElement("a");
    const name = document.createElement("span");
    const action = document.createElement("b");

    shortcut.className = "folder-shortcut";
    shortcut.href = app.href;
    name.textContent = app.name;
    action.textContent = "Open";
    shortcut.append(name, action);
    return shortcut;
  });

  folderItems.replaceChildren(...shortcutElements);
  folderEmpty.hidden = shortcutElements.length > 0;
}

function saveFolderItems(email, items) {
  const accounts = readAccounts();

  if (!accounts[email]) {
    return;
  }

  accounts[email].folderItems = [...items];
  writeAccounts(accounts);
  renderAccountFolder();
}

function setupFolderActions() {
  cards.forEach((card) => {
    const details = getCardDetails(card);
    const actions = card.querySelector(".actions");

    card.dataset.accountAppId = details.id;
    if (!actions || actions.querySelector("[data-folder-action]")) {
      return;
    }

    const button = document.createElement("button");
    button.className = "folder-action";
    button.type = "button";
    button.dataset.folderAction = "";
    actions.append(button);
  });
}

function activateAccount(email) {
  localStorage.setItem(accountSessionKey, email);
  renderAccountFolder();
  window.dispatchEvent(new Event("awesome-account-change"));
  closeAccountDialog();
  accountFolder.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function submitAccount(event) {
  event.preventDefault();
  const email = normalize(accountEmail.value);
  const password = accountPassword.value;

  if (!email || accountEmail.validity.typeMismatch) {
    setAccountMessage("Enter a valid email address.");
    accountEmail.focus();
    return;
  }

  if (password.length < 6) {
    setAccountMessage("Your password needs at least 6 characters.");
    accountPassword.focus();
    return;
  }

  accountSubmit.disabled = true;
  const accounts = readAccounts();

  try {
    if (accountMode === "create") {
      if (accounts[email]) {
        setAccountMessage("That account already exists. Choose Log in.");
        return;
      }

      const salt = createSalt();
      accounts[email] = {
        email,
        salt,
        passwordHash: await hashPassword(password, salt),
        folderItems: []
      };
      writeAccounts(accounts);
      activateAccount(email);
      return;
    }

    const account = accounts[email];
    if (!account) {
      setAccountMessage("No account was found for that email.");
      return;
    }

    const passwordHash = await hashPassword(password, account.salt);
    if (passwordHash !== account.passwordHash) {
      setAccountMessage("That password does not match.");
      return;
    }

    activateAccount(email);
  } catch (error) {
    setAccountMessage("The account could not be opened on this device.");
  } finally {
    accountSubmit.disabled = false;
  }
}

function cardMatchesFilter(card) {
  if (activeFilter === "all") {
    return true;
  }

  if (activeFilter === "soon") {
    return card.dataset.tags.includes("soon");
  }

  return card.dataset.tags.includes(activeFilter);
}

function cardMatchesSearch(card, query) {
  if (!query) {
    return true;
  }

  const title = card.querySelector("h2")?.textContent || "";
  const description = card.querySelector(".card-body p")?.textContent || "";
  const text = `${title} ${description} ${card.dataset.tags}`.toLowerCase();
  return text.includes(query);
}

function updateCards() {
  const query = normalize(searchInput.value);
  let visibleCount = 0;

  cards.forEach((card) => {
    const isVisible = cardMatchesFilter(card) && cardMatchesSearch(card, query);
    card.classList.toggle("is-hidden", !isVisible);
    if (isVisible) {
      visibleCount += 1;
    }
  });

  emptyState.hidden = visibleCount !== 0;
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    filterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    updateCards();
  });
});

searchInput.addEventListener("input", updateCards);
accountTrigger.addEventListener("click", () => {
  if (getSignedInAccount()) {
    accountFolder.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  openAccountDialog("login");
});

accountModeButtons.forEach((button) => {
  button.addEventListener("click", () => setAccountMode(button.dataset.accountMode));
});

accountClose.addEventListener("click", closeAccountDialog);
accountDialog.addEventListener("click", (event) => {
  if (event.target === accountDialog) {
    closeAccountDialog();
  }
});

accountForm.addEventListener("submit", submitAccount);
signOutButton.addEventListener("click", () => {
  localStorage.removeItem(accountSessionKey);
  renderAccountFolder();
  window.dispatchEvent(new Event("awesome-account-change"));
  accountTrigger.focus();
});

document.addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-folder-action]");
  if (!button) {
    return;
  }

  const account = getSignedInAccount();
  if (!account) {
    openAccountDialog("login");
    setAccountMessage("Log in to use your Awesome Development Folder.");
    return;
  }

  const card = button.closest(".app-card");
  const details = getCardDetails(card);
  const savedApps = new Set(account.folderItems || []);

  if (savedApps.has(details.id)) {
    savedApps.delete(details.id);
  } else {
    savedApps.add(details.id);
  }

  saveFolderItems(account.email, savedApps);
});

window.addEventListener("pageshow", () => {
  updateMembershipApps();
  renderAccountFolder();
});
window.addEventListener("storage", () => {
  updateMembershipApps();
  renderAccountFolder();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    updateMembershipApps();
    renderAccountFolder();
  }
});

setupFolderActions();
updateMembershipApps();
renderAccountFolder();
updateCards();
