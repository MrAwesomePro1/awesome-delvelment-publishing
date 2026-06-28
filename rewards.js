(function () {
  const storageKey = "awesomeDelvelmentRewards";
  const accountStorageKey = "awesomeDelvelmentAccountsV1";
  const accountSessionKey = "awesomeDelvelmentSessionV1";
  const passLengthMs = 12 * 7 * 24 * 60 * 60 * 1000;
  const yearSeconds = 365 * 24 * 60 * 60;
  const codeUnlockSeconds = 60 * 60;
  const milestones = [
    { id: "five", label: "5 ADC", seconds: 5 * 60, amount: 5, code: "AWESOME-ADC-5" },
    { id: "nineteen", label: "19 ADC", seconds: 10 * 60, amount: 19, code: "AWESOME-ADC-19" },
    { id: "pass", label: "100 ADC + 12-week Membership", seconds: 60 * 60, amount: 100, code: "AWESOME-ADC-12WEEK-MEMBER-100" },
    { id: "billion", label: "1 billion ADC", seconds: 100 * yearSeconds, amount: 1000000000, code: "AWESOME-ADC-BILLION" }
  ];
  const finalMilestoneSeconds = milestones[milestones.length - 1].seconds;

  const rewardsApp = document.querySelector("[data-rewards-app]");
  let state = readState();
  let isPaused = false;

  function readState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      const loadedState = {
        totalSeconds: Math.max(0, Number(saved?.totalSeconds) || 0),
        claimed: saved?.claimed && typeof saved.claimed === "object" ? saved.claimed : {},
        passExpiresAt: Math.max(0, Number(saved?.passExpiresAt) || 0),
        unlimitedClaims: Boolean(saved?.unlimitedClaims),
        bonusWalletCredit: Math.max(0, Number(saved?.bonusWalletCredit) || 0),
        walletSpent: Math.max(0, Number(saved?.walletSpent) || 0),
        walletHistory: Array.isArray(saved?.walletHistory)
          ? saved.walletHistory.slice(0, 8).map((item) => ({
              ...item,
              label: String(item.label || "Reward activity").replaceAll("BTC", "ADC")
            }))
          : []
      };

      Object.keys(loadedState.claimed).forEach((rewardId) => {
        if (typeof loadedState.claimed[rewardId] === "string") {
          loadedState.claimed[rewardId] = loadedState.claimed[rewardId].replace("AWESOME-BTC", "AWESOME-ADC");
        }
      });

      if (loadedState.unlimitedClaims) {
        loadedState.totalSeconds = Math.max(loadedState.totalSeconds, codeUnlockSeconds);
        milestones.forEach((reward) => {
          loadedState.claimed[reward.id] = `${reward.code}-2017`;
        });
      }

      return loadedState;
    } catch (error) {
      return {
        totalSeconds: 0,
        claimed: {},
        passExpiresAt: 0,
        unlimitedClaims: false,
        bonusWalletCredit: 0,
        walletSpent: 0,
        walletHistory: []
      };
    }
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function isAccountSignedIn() {
    const email = (localStorage.getItem(accountSessionKey) || "").trim().toLowerCase();
    if (!email) {
      return false;
    }

    try {
      const accounts = JSON.parse(localStorage.getItem(accountStorageKey));
      return Boolean(accounts && typeof accounts === "object" && accounts[email]);
    } catch (error) {
      return false;
    }
  }

  function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
  }

  function formatWait(totalSeconds) {
    if (totalSeconds >= yearSeconds) {
      const years = Math.ceil(totalSeconds / yearSeconds);
      return `${years} ${years === 1 ? "year" : "years"}`;
    }

    const daySeconds = 24 * 60 * 60;
    if (totalSeconds >= daySeconds) {
      const days = Math.ceil(totalSeconds / daySeconds);
      return `${days} ${days === 1 ? "day" : "days"}`;
    }

    return formatTime(totalSeconds);
  }

  function rewardCode(reward) {
    const suffix = String(Math.floor(state.totalSeconds)).padStart(4, "0");
    return `${reward.code}-${suffix}`;
  }

  function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }

  function formatCoins(amount) {
    return `${Math.max(0, amount).toLocaleString(undefined, { maximumFractionDigits: 0 })} ADC`;
  }

  function walletEarned() {
    const claimedTotal = milestones.reduce((total, reward) => {
      return state.claimed[reward.id] ? total + reward.amount : total;
    }, 0);

    return claimedTotal + state.bonusWalletCredit;
  }

  function walletBalance() {
    return Math.max(0, walletEarned() - state.walletSpent);
  }

  function walletCode() {
    if (!walletEarned()) {
      return "Claim rewards to unlock";
    }

    const claimedCount = milestones.filter((reward) => state.claimed[reward.id]).length;
    return `AWESOME-ADC-${claimedCount}-${String(walletEarned()).padStart(3, "0")}`;
  }

  function unlockEverything() {
    state.totalSeconds = Math.max(state.totalSeconds, codeUnlockSeconds);
    state.unlimitedClaims = true;
    milestones.forEach((reward) => {
      state.claimed[reward.id] = `${reward.code}-2017`;
    });
    state.passExpiresAt = Date.now() + passLengthMs;
    state.walletSpent = 0;
    state.walletHistory.unshift({
      amount: walletEarned(),
      date: Date.now(),
      label: "Unlock code used - repeat claims on"
    });
    state.walletHistory = state.walletHistory.slice(0, 8);
    saveState();
  }

  function nextReward() {
    if (state.unlimitedClaims) {
      return undefined;
    }

    return milestones.find((reward) => state.totalSeconds < reward.seconds);
  }

  function isReady(reward) {
    return state.unlimitedClaims || state.totalSeconds >= reward.seconds;
  }

  function render() {
    const signedIn = isAccountSignedIn();
    const visibleBalance = signedIn ? walletBalance() : 0;

    document.querySelectorAll("[data-home-coin-balance]").forEach((balanceLabel) => {
      balanceLabel.textContent = formatCoins(visibleBalance);
    });

    if (!rewardsApp) {
      return;
    }

    const totalTime = document.querySelector("[data-total-time]");
    const trackerState = document.querySelector("[data-tracker-state]");
    const progressBar = document.querySelector("[data-progress-bar]");
    const nextRewardLabel = document.querySelector("[data-next-reward]");
    const toggleButton = document.querySelector("[data-toggle-tracking]");
    const passCard = document.querySelector("[data-pass-card]");
    const passCode = document.querySelector("[data-pass-code]");
    const walletBalanceLabel = document.querySelector("[data-wallet-balance]");
    const walletEarnedLabel = document.querySelector("[data-wallet-earned]");
    const walletSpentLabel = document.querySelector("[data-wallet-spent]");
    const walletCodeLabel = document.querySelector("[data-wallet-code]");
    const walletHistory = document.querySelector("[data-wallet-history]");
    const next = nextReward();
    const earned = signedIn ? walletEarned() : 0;
    const spent = signedIn ? state.walletSpent : 0;
    const balance = visibleBalance;

    totalTime.textContent = formatTime(state.totalSeconds);
    trackerState.textContent = document.hidden || isPaused ? "Paused" : "Tracking";
    toggleButton.textContent = isPaused ? "Resume" : "Pause";
    const progressTarget = next ? next.seconds : finalMilestoneSeconds;
    const progressPercent = state.unlimitedClaims ? 100 : (state.totalSeconds / progressTarget) * 100;
    progressBar.style.width = `${Math.min(100, progressPercent)}%`;

    if (next) {
      const remaining = next.seconds - state.totalSeconds;
      nextRewardLabel.textContent = `Next reward: ${next.label} in ${formatWait(remaining)}`;
    } else {
      nextRewardLabel.textContent = "All rewards unlocked";
    }

    milestones.forEach((reward) => {
      const card = document.querySelector(`[data-reward-card="${reward.id}"]`);
      const status = document.querySelector(`[data-reward-status="${reward.id}"]`);
      const button = document.querySelector(`[data-claim-reward="${reward.id}"]`);
      const code = document.querySelector(`[data-reward-code="${reward.id}"]`);
      const ready = isReady(reward);
      const claimed = Boolean(state.claimed[reward.id]);
      const canRepeatClaim = state.unlimitedClaims && claimed;

      card.classList.toggle("is-ready", (ready && !claimed) || canRepeatClaim);
      card.classList.toggle("is-claimed", claimed);
      status.textContent = canRepeatClaim ? "Repeat" : claimed ? "Claimed" : ready ? "Ready" : "Locked";
      button.disabled = !ready || (claimed && !state.unlimitedClaims);
      button.textContent = canRepeatClaim ? "Claim again" : claimed ? "Claimed" : ready ? "Claim" : "Locked";

      if (claimed) {
        code.hidden = false;
        if (reward.id === "pass") {
          const passDate = state.passExpiresAt ? formatDate(state.passExpiresAt) : "12 weeks after claim";
          const repeatText = state.unlimitedClaims ? " - Repeat claims unlocked" : "";
          code.textContent = `Reward code: ${state.claimed[reward.id]} - Membership active until ${passDate}${repeatText}`;
        } else {
          const repeatText = state.unlimitedClaims ? " - Repeat claims unlocked" : "";
          code.textContent = `Reward code: ${state.claimed[reward.id]}${repeatText}`;
        }
      } else {
        code.hidden = true;
        code.textContent = "";
      }
    });

    const passClaimed = Boolean(state.claimed.pass);
    const passExpired = passClaimed && state.passExpiresAt && state.passExpiresAt < Date.now();
    passCard.classList.toggle("is-active", passClaimed && !passExpired);

    if (passClaimed && passExpired) {
      passCode.textContent = `Expired ${formatDate(state.passExpiresAt)}`;
    } else if (passClaimed) {
      const passDate = state.passExpiresAt ? formatDate(state.passExpiresAt) : "12 weeks after claim";
      passCode.textContent = `12-week membership active until ${passDate}`;
    } else {
      passCode.textContent = "12 weeks locked";
    }

    walletBalanceLabel.textContent = formatCoins(balance);
    walletEarnedLabel.textContent = `Earned: ${formatCoins(earned)}`;
    walletSpentLabel.textContent = `Used online: ${formatCoins(spent)}`;
    walletCodeLabel.textContent = signedIn ? walletCode() : "Log in to view";

    document.querySelectorAll("[data-spend-online]").forEach((button) => {
      const amount = Number(button.dataset.spendOnline);
      button.disabled = !signedIn || balance < amount;
    });

    if (!signedIn) {
      walletHistory.textContent = "Log in to view ADC activity.";
    } else if (state.walletHistory.length) {
      walletHistory.replaceChildren();
      state.walletHistory.forEach((item) => {
        const line = document.createElement("span");
        line.textContent = `${item.label} - ${formatDate(item.date)}`;
        walletHistory.append(line);
      });
    } else {
      walletHistory.textContent = "No ADC spending yet.";
    }
  }

  function tick() {
    if (!document.hidden && !isPaused) {
      state.totalSeconds += 1;
      saveState();
      render();
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      state = readState();
    }
    render();
  });

  window.addEventListener("pageshow", () => {
    state = readState();
    render();
  });

  window.addEventListener("storage", () => {
    state = readState();
    render();
  });

  window.addEventListener("awesome-account-change", render);

  if (rewardsApp) {
    document.querySelector("[data-toggle-tracking]").addEventListener("click", () => {
      isPaused = !isPaused;
      render();
    });

    document.querySelectorAll("[data-claim-reward]").forEach((button) => {
      button.addEventListener("click", () => {
        const reward = milestones.find((item) => item.id === button.dataset.claimReward);
        if (!reward || !isReady(reward)) {
          return;
        }

        const claimed = Boolean(state.claimed[reward.id]);
        if (claimed && !state.unlimitedClaims) {
          return;
        }

        if (claimed && state.unlimitedClaims) {
          state.bonusWalletCredit += reward.amount;
          if (reward.id === "pass") {
            state.passExpiresAt = Math.max(Date.now(), state.passExpiresAt || 0) + passLengthMs;
          }
          state.walletHistory.unshift({
            amount: reward.amount,
            date: Date.now(),
            label: `${formatCoins(reward.amount)} claimed again`
          });
          state.walletHistory = state.walletHistory.slice(0, 8);
          saveState();
          render();
          return;
        }

        state.claimed[reward.id] = rewardCode(reward);
        if (reward.id === "pass") {
          state.passExpiresAt = Date.now() + passLengthMs;
        }
        saveState();
        render();
      });
    });

    document.querySelector("[data-copy-wallet-code]").addEventListener("click", async () => {
      const status = document.querySelector("[data-wallet-copy-status]");
      const code = walletCode();

      if (!isAccountSignedIn()) {
        status.textContent = "Log in first";
        return;
      }

      if (!walletEarned()) {
        status.textContent = "Claim a reward first";
        return;
      }

      try {
        await navigator.clipboard.writeText(code);
        status.textContent = "Copied";
      } catch (error) {
        status.textContent = code;
      }
    });

    document.querySelectorAll("[data-spend-online]").forEach((button) => {
      button.addEventListener("click", () => {
        const amount = Number(button.dataset.spendOnline);
        if (!isAccountSignedIn() || walletBalance() < amount) {
          return;
        }

        state.walletSpent += amount;
        state.walletHistory.unshift({
          amount,
          date: Date.now(),
          label: `${formatCoins(amount)} used online`
        });
        state.walletHistory = state.walletHistory.slice(0, 8);
        saveState();
        render();
      });
    });

    document.querySelector("[data-unlock-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = document.querySelector("[data-unlock-code]");
      const status = document.querySelector("[data-unlock-status]");

      if (input.value.trim() === "2017") {
        unlockEverything();
        input.value = "";
        status.textContent = "Everything unlocked. Claim buttons can be pressed forever.";
        render();
        return;
      }

      status.textContent = "Code not accepted";
    });
  }

  render();
  window.setInterval(tick, 1000);
})();
