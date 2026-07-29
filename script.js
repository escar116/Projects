const firebaseConfig = {
  apiKey: "AIzaSyD4Js1lZ1SSLiAv6JiHevau5TlIdA2vzVY",
  authDomain: "freelance-9d09d.firebaseapp.com",
  projectId: "freelance-9d09d",
  storageBucket: "freelance-9d09d.firebasestorage.app",
  messagingSenderId: "133455816148",
  appId: "1:133455816148:web:81ae5e50d658faabd6a241",
  measurementId: "G-SET64JC8HH"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let appState = {
  currentUser: null,
  usersMap: {},
  jobs: [],
  chats: [],
  activeTab: "jobs-view",
  currentSearch: "",
  durationFilter: "all",
  activeChatId: null,
  activeApplicantJobId: null,
  selectedRatingStars: 5,
  ratingTargetJobId: null,
  authMode: "signin"
};

let firestoreListenersInitialized = false;

function showToast(msg, type = "info") {
  let toastContainer = document.getElementById("toast-container");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "toast-container";
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement("div");
  toast.className = `toast-item toast-${type}`;
  toast.textContent = msg;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("show");
  }, 10);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  startLiveTimestampTimer();
  initAuth();
});

function initAuth() {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      checkUserProfile(user);
    } else {
      appState.currentUser = null;
      showAuthModal("entry");
    }
  });
}

function checkUserProfile(authUser) {
  db.collection("users").doc(authUser.uid).onSnapshot((doc) => {
    if (doc.exists && doc.data().name && doc.data().bio) {
      appState.currentUser = { id: doc.id, ...doc.data() };
      closeModal("auth-modal");
      if (!firestoreListenersInitialized) {
        initFirestoreListeners();
      }
      renderAll();
    } else {
      appState.currentUser = { id: authUser.uid, email: authUser.email, isNew: true };
      const nameInput = document.getElementById("user-name-input");
      if (nameInput && authUser.displayName) {
        nameInput.value = authUser.displayName;
      }
      showAuthModal("onboarding");
    }
  });
}

function showAuthModal(section) {
  const modal = document.getElementById("auth-modal");
  const entrySection = document.getElementById("auth-entry-section");
  const onboardingSection = document.getElementById("auth-onboarding-section");

  modal.classList.add("active");
  if (section === "entry") {
    entrySection.style.display = "block";
    onboardingSection.style.display = "none";
  } else if (section === "onboarding") {
    entrySection.style.display = "none";
    onboardingSection.style.display = "block";
  }
}

function initFirestoreListeners() {
  if (firestoreListenersInitialized) return;
  firestoreListenersInitialized = true;

  db.collection("users").onSnapshot((snapshot) => {
    snapshot.forEach((doc) => {
      appState.usersMap[doc.id] = { id: doc.id, ...doc.data() };
    });
    renderAll();
  });

  db.collection("jobs").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
    appState.jobs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderAll();
  });

  db.collection("chats").onSnapshot((snapshot) => {
    appState.chats = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderAll();
  });
}

function getRelativeTime(timestamp) {
  if (!timestamp) return "just now";
  const ts = typeof timestamp === "number" ? timestamp : timestamp.toMillis ? timestamp.toMillis() : Date.now();
  const diffInSecs = Math.floor((Date.now() - ts) / 1000);

  if (diffInSecs < 30) return "just now";
  if (diffInSecs < 60) return `${diffInSecs}s ago`;

  const diffInMins = Math.floor(diffInSecs / 60);
  if (diffInMins < 60) return `${diffInMins}m ago`;

  const diffInHours = Math.floor(diffInMins / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;

  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}d ago`;
}

function startLiveTimestampTimer() {
  setInterval(() => {
    document.querySelectorAll(".live-timestamp").forEach((el) => {
      const ts = parseInt(el.getAttribute("data-timestamp"), 10);
      if (ts) el.textContent = getRelativeTime(ts);
    });
  }, 15000);
}

function setupEventListeners() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!appState.currentUser || appState.currentUser.isNew) {
        showAuthModal(appState.currentUser ? "onboarding" : "entry");
        return;
      }
      const tabId = btn.getAttribute("data-tab");
      switchTab(tabId);
    });
  });

  document.getElementById("google-login-btn")?.addEventListener("click", handleGoogleSignIn);

  document.getElementById("tab-signin-btn")?.addEventListener("click", () => setAuthTab("signin"));
  document.getElementById("tab-signup-btn")?.addEventListener("click", () => setAuthTab("signup"));

  document.getElementById("email-auth-form")?.addEventListener("submit", handleEmailAuthSubmit);

  document.getElementById("profile-logout-btn")?.addEventListener("click", handleLogout);
  document.getElementById("sidebar-logout-btn")?.addEventListener("click", handleLogout);

  document.getElementById("edit-profile-btn")?.addEventListener("click", openEditProfileModal);

  const searchInput = document.getElementById("job-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      appState.currentSearch = e.target.value.toLowerCase().trim();
      renderJobsGrid();
    });
  }

  document.querySelectorAll("#duration-filter-group .filter-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("#duration-filter-group .filter-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      appState.durationFilter = pill.getAttribute("data-filter");
      renderJobsGrid();
    });
  });

  const postForm = document.getElementById("post-job-form");
  if (postForm) {
    postForm.addEventListener("submit", (e) => {
      e.preventDefault();
      handlePostJobSubmit();
    });
  }

  const onboardingForm = document.getElementById("onboarding-form");
  if (onboardingForm) {
    onboardingForm.addEventListener("submit", (e) => {
      e.preventDefault();
      handleOnboardingSubmit();
    });
  }

  const chatSendForm = document.getElementById("chat-send-form");
  if (chatSendForm) {
    chatSendForm.addEventListener("submit", (e) => {
      e.preventDefault();
      handleSendChatMessage();
    });
  }

  const starContainer = document.getElementById("star-rating-selector");
  if (starContainer) {
    starContainer.querySelectorAll("span").forEach((star) => {
      star.addEventListener("click", () => {
        const val = parseInt(star.getAttribute("data-star"), 10);
        appState.selectedRatingStars = val;
        updateStarUI(val);
      });
      star.addEventListener("mouseenter", () => {
        const val = parseInt(star.getAttribute("data-star"), 10);
        updateStarUI(val);
      });
    });
    starContainer.addEventListener("mouseleave", () => {
      updateStarUI(appState.selectedRatingStars);
    });
  }

  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay && overlay.id !== "auth-modal") {
        closeModal(overlay.id);
      }
    });
  });

  const ratingForm = document.getElementById("rating-form");
  if (ratingForm) {
    ratingForm.addEventListener("submit", (e) => {
      e.preventDefault();
      handleRatingSubmit();
    });
  }

  const completeBtn = document.getElementById("complete-job-btn");
  if (completeBtn) {
    completeBtn.addEventListener("click", () => {
      if (appState.activeChatId) {
        const chat = appState.chats.find((c) => c.id === appState.activeChatId);
        if (chat) openRatingModal(chat.jobId);
      }
    });
  }

  const terminateBtn = document.getElementById("terminate-job-btn");
  if (terminateBtn) {
    terminateBtn.addEventListener("click", () => {
      if (appState.activeChatId) {
        const chat = appState.chats.find((c) => c.id === appState.activeChatId);
        if (chat) handleTerminateJob(chat.jobId);
      }
    });
  }
}

function setAuthTab(mode) {
  appState.authMode = mode;
  document.getElementById("tab-signin-btn").classList.toggle("active", mode === "signin");
  document.getElementById("tab-signup-btn").classList.toggle("active", mode === "signup");
  document.getElementById("email-submit-btn").textContent = mode === "signin" ? "Sign In" : "Create Account";
  hideAuthError();
}

function showAuthError(err) {
  const errEl = document.getElementById("auth-error-msg");
  if (!errEl) return;

  let msg = typeof err === "string" ? err : err.message || "An authentication error occurred.";
  const code = err.code || "";

  if (code === "auth/unauthorized-domain" || msg.includes("unauthorized-domain")) {
    msg = "🌐 Domain not authorized! Please open the app via http://localhost:8080 or add your current domain to Firebase Console -> Authentication -> Settings -> Authorized Domains.";
  } else if (code === "auth/operation-not-allowed" || msg.includes("operation-not-allowed")) {
    msg = "🔑 Email/Password sign-in is disabled in your Firebase project. Enable it in Firebase Console -> Authentication -> Sign-in method -> Add new provider -> Email/Password.";
  } else if (code === "auth/user-not-found") {
    msg = "Account not found. Click 'Sign Up' above to register a new account.";
  } else if (code === "auth/wrong-password") {
    msg = "Incorrect password. Please try again.";
  } else if (code === "auth/email-already-in-use") {
    msg = "This email is already registered. Please click 'Sign In' to log into your account.";
  }

  errEl.textContent = msg;
  errEl.style.display = "block";
}

function hideAuthError() {
  const errEl = document.getElementById("auth-error-msg");
  if (errEl) errEl.style.display = "none";
}

async function handleGoogleSignIn() {
  hideAuthError();
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
  } catch (err) {
    showAuthError(err);
  }
}

async function handleEmailAuthSubmit(e) {
  e.preventDefault();
  hideAuthError();

  const email = document.getElementById("auth-email-input").value.trim();
  const password = document.getElementById("auth-password-input").value;

  if (!email || !password) return;

  try {
    if (appState.authMode === "signup") {
      await auth.createUserWithEmailAndPassword(email, password);
    } else {
      await auth.signInWithEmailAndPassword(email, password);
    }
  } catch (err) {
    showAuthError(err);
  }
}

async function handleLogout() {
  try {
    await auth.signOut();
  } catch (err) {
    console.error("Logout Error:", err);
  }
}

function updateStarUI(val) {
  const starContainer = document.getElementById("star-rating-selector");
  if (!starContainer) return;
  starContainer.querySelectorAll("span").forEach((star) => {
    const sVal = parseInt(star.getAttribute("data-star"), 10);
    if (sVal <= val) {
      star.classList.add("selected");
    } else {
      star.classList.remove("selected");
    }
  });
}

function switchTab(tabId) {
  appState.activeTab = tabId;
  document.querySelectorAll(".tab-view").forEach((tab) => tab.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((btn) => btn.classList.remove("active"));

  const targetTab = document.getElementById(tabId);
  const targetNav = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);

  if (targetTab) targetTab.classList.add("active");
  if (targetNav) targetNav.classList.add("active");

  renderAll();
}

function renderAll() {
  renderSidebarUser();
  renderProfileTab();
  renderJobsGrid();
  renderMyJobsTab();
  renderChatsTab();
}

function getCurrentUser() {
  return appState.currentUser;
}

function renderSidebarUser() {
  const user = getCurrentUser();
  if (!user || user.isNew) return;

  const avatarEl = document.getElementById("sidebar-user-avatar");
  const nameEl = document.getElementById("sidebar-user-name");
  const roleEl = document.getElementById("sidebar-user-role");

  if (avatarEl) avatarEl.textContent = user.avatar || "";
  if (nameEl) nameEl.textContent = user.name || "User";
  if (roleEl) roleEl.textContent = user.sex && user.age ? `${user.sex}, ${user.age} yrs` : "Active Account";
}

function renderProfileTab() {
  const user = getCurrentUser();
  if (!user || user.isNew) return;

  document.getElementById("profile-avatar").textContent = user.avatar || "";
  document.getElementById("profile-name").textContent = user.name || "User";
  document.getElementById("profile-age-tag").textContent = `Age: ${user.age || '--'}`;
  document.getElementById("profile-sex-tag").textContent = `Sex: ${user.sex || '--'}`;
  document.getElementById("profile-bio").textContent = user.bio || "No bio provided.";

  const ratings = user.ratings || [];
  const avg = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : "5.0";

  document.getElementById("profile-rating-score").textContent = `${avg} / 5.0`;
  document.getElementById("profile-completed-count").textContent = user.completedJobs || 0;
  document.getElementById("profile-reviews-count").textContent = (user.reviews || []).length;

  const reviewsContainer = document.getElementById("profile-reviews-list");
  if (reviewsContainer) {
    if (!user.reviews || user.reviews.length === 0) {
      reviewsContainer.innerHTML = `
        <div class="empty-state">
          <p>No customer reviews yet. Complete tasks to earn feedback!</p>
        </div>
      `;
    } else {
      reviewsContainer.innerHTML = user.reviews.map((r) => `
        <div class="review-item">
          <div class="review-top">
            <span class="reviewer-name">${r.reviewerName}</span>
            <span class="review-stars">${"★".repeat(r.stars)}${"☆".repeat(5 - r.stars)}</span>
          </div>
          <p class="review-comment">"${r.comment}"</p>
          <p class="review-date">${r.date}</p>
        </div>
      `).join("");
    }
  }
}

function renderJobsGrid() {
  const container = document.getElementById("jobs-grid-container");
  if (!container) return;

  const currentUser = getCurrentUser();

  let filtered = appState.jobs.filter((job) => {
    if (job.status !== "Open") return false;

    const matchesSearch =
      !appState.currentSearch ||
      job.title.toLowerCase().includes(appState.currentSearch) ||
      job.description.toLowerCase().includes(appState.currentSearch);

    let matchesDuration = true;
    const mins = job.durationMinutesTotal || 30;
    if (appState.durationFilter === "quick") matchesDuration = mins < 30;
    else if (appState.durationFilter === "medium") matchesDuration = mins >= 30 && mins <= 120;
    else if (appState.durationFilter === "long") matchesDuration = mins > 120;

    return matchesSearch && matchesDuration;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h3>No open tasks available</h3>
        <p>Post a task or check back later for new opportunities!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((job) => {
    const poster = appState.usersMap[job.posterId] || { name: job.posterName || "User", avatar: "" };
    const isPoster = currentUser && currentUser.id === job.posterId;
    const hasApplied = currentUser && (job.applicantIds || []).includes(currentUser.id);
    const applicantCount = (job.applicantIds || []).length;

    let actionBtnHtml = "";
    if (isPoster) {
      actionBtnHtml = `
        <button class="btn btn-secondary btn-sm" onclick="openApplicantsModal('${job.id}')">
          Applicant Queue (${applicantCount})
        </button>
      `;
    } else {
      if (hasApplied) {
        actionBtnHtml = `<span class="chip-tag" style="color: var(--accent-success); border-color: rgba(16, 185, 129, 0.3);">Applied</span>`;
      } else {
        actionBtnHtml = `
          <button class="btn btn-primary btn-sm" onclick="handleApplyJob('${job.id}')">
            Apply Now
          </button>
        `;
      }
    }

    const createdTs = typeof job.createdAt === "number" ? job.createdAt : job.createdAt?.toMillis ? job.createdAt.toMillis() : Date.now();

    return `
      <div class="job-card">
        <div>
          <div class="job-card-header">
            <h3 class="job-title">${job.title}</h3>
            <span class="job-status-badge status-open">Open</span>
          </div>

          <div class="job-meta-row">
            <span class="job-meta-item">${job.durationValue} ${job.durationUnit}</span>
            <span>•</span>
            <span class="job-meta-item live-timestamp" data-timestamp="${createdTs}">${getRelativeTime(createdTs)}</span>
          </div>

          <p class="job-description">${job.description}</p>
        </div>

        <div class="job-footer">
          <div class="poster-mini">
            <div class="poster-avatar">${poster.avatar || ''}</div>
            <span class="poster-name">${poster.name || 'User'}</span>
          </div>
          <div>${actionBtnHtml}</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderMyJobsTab() {
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.isNew) return;

  const ongoingContainer = document.getElementById("ongoing-jobs-container");
  const appliedContainer = document.getElementById("applied-jobs-container");
  const postedContainer = document.getElementById("posted-jobs-container");

  const ongoingJobs = appState.jobs.filter(
    (j) => j.status === "In Progress" && (j.approvedApplicantId === currentUser.id || j.posterId === currentUser.id)
  );

  const appliedJobs = appState.jobs.filter(
    (j) => j.status === "Open" && (j.applicantIds || []).includes(currentUser.id) && j.posterId !== currentUser.id
  );

  const postedJobs = appState.jobs.filter(
    (j) => j.posterId === currentUser.id && j.status !== "Completed" && j.status !== "Terminated"
  );

  const badge = document.getElementById("my-jobs-badge");
  const totalActiveMyJobs = ongoingJobs.length + appliedJobs.length;
  if (badge) {
    if (totalActiveMyJobs > 0) {
      badge.textContent = totalActiveMyJobs;
      badge.classList.add("active");
    } else {
      badge.classList.remove("active");
    }
  }

  if (ongoingContainer) {
    if (ongoingJobs.length === 0) {
      ongoingContainer.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">No ongoing approved jobs right now.</p>`;
    } else {
      ongoingContainer.innerHTML = ongoingJobs.map((job) => buildJobCardHTML(job, currentUser, "ongoing")).join("");
    }
  }

  if (appliedContainer) {
    if (appliedJobs.length === 0) {
      appliedContainer.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">You haven't applied for any pending jobs.</p>`;
    } else {
      appliedContainer.innerHTML = appliedJobs.map((job) => buildJobCardHTML(job, currentUser, "applied")).join("");
    }
  }

  if (postedContainer) {
    if (postedJobs.length === 0) {
      postedContainer.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">You haven't posted any active unfinished jobs.</p>`;
    } else {
      postedContainer.innerHTML = postedJobs.map((job) => buildJobCardHTML(job, currentUser, "posted")).join("");
    }
  }
}

function buildJobCardHTML(job, currentUser, category) {
  const poster = appState.usersMap[job.posterId] || { name: job.posterName || "User", avatar: "" };
  const applicantCount = (job.applicantIds || []).length;

  let actionHtml = "";
  if (category === "ongoing") {
    actionHtml = `
      <button class="btn btn-primary btn-sm" onclick="openJobChat('${job.id}')">
        Open Chat
      </button>
    `;
  } else if (category === "applied") {
    actionHtml = `
      <button class="btn btn-secondary btn-sm" onclick="withdrawApplication('${job.id}')" style="color: var(--accent-danger);">
        Withdraw
      </button>
    `;
  } else if (category === "posted") {
    if (job.status === "Open") {
      actionHtml = `
        <button class="btn btn-secondary btn-sm" onclick="openApplicantsModal('${job.id}')">
          Applicants Queue (${applicantCount})
        </button>
      `;
    } else {
      actionHtml = `
        <button class="btn btn-primary btn-sm" onclick="openJobChat('${job.id}')">
          Open Chat
        </button>
      `;
    }
  }

  let statusBadgeClass = "status-open";
  if (job.status === "In Progress") statusBadgeClass = "status-in-progress";

  const createdTs = typeof job.createdAt === "number" ? job.createdAt : job.createdAt?.toMillis ? job.createdAt.toMillis() : Date.now();

  return `
    <div class="job-card">
      <div>
        <div class="job-card-header">
          <h3 class="job-title">${job.title}</h3>
          <span class="job-status-badge ${statusBadgeClass}">${job.status}</span>
        </div>

        <div class="job-meta-row">
          <span class="job-meta-item">${job.durationValue} ${job.durationUnit}</span>
          <span>•</span>
          <span class="job-meta-item live-timestamp" data-timestamp="${createdTs}">${getRelativeTime(createdTs)}</span>
        </div>

        <p class="job-description">${job.description}</p>
      </div>

      <div class="job-footer">
        <div class="poster-mini">
          <div class="poster-avatar">${poster.avatar || ''}</div>
          <span class="poster-name">${poster.name || 'User'}</span>
        </div>
        <div>${actionHtml}</div>
      </div>
    </div>
  `;
}

async function withdrawApplication(jobId) {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  try {
    await db.collection("jobs").doc(jobId).update({
      applicantIds: firebase.firestore.FieldValue.arrayRemove(currentUser.id)
    });
    showToast("Application withdrawn", "info");
  } catch (err) {
    console.error("Withdraw Error:", err);
  }
}

async function handlePostJobSubmit() {
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.isNew) return;

  const title = document.getElementById("job-title-input").value.trim();
  const durationVal = parseInt(document.getElementById("job-duration-val").value, 10);
  const durationUnit = document.getElementById("job-duration-unit").value;
  const description = document.getElementById("job-desc-input").value.trim();

  if (!title || !durationVal || !description) return;

  const totalMinutes = durationUnit === "Hours" ? durationVal * 60 : durationVal;

  try {
    await db.collection("jobs").add({
      posterId: currentUser.id,
      posterName: currentUser.name,
      title: title,
      durationValue: durationVal,
      durationUnit: durationUnit,
      durationMinutesTotal: totalMinutes,
      description: description,
      createdAt: Date.now(),
      status: "Open",
      applicantIds: [],
      approvedApplicantId: null
    });

    document.getElementById("post-job-form").reset();
    showToast("Task posted to marketplace!", "success");
    switchTab("my-jobs-view");
  } catch (err) {
    console.error("Post Job Error:", err);
  }
}

async function handleApplyJob(jobId) {
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.isNew) {
    showAuthModal(currentUser ? "onboarding" : "entry");
    return;
  }

  const job = appState.jobs.find((j) => j.id === jobId);
  if (!job) return;

  if (job.posterId === currentUser.id) {
    alert("You cannot apply to your own posted job!");
    return;
  }

  try {
    await db.collection("jobs").doc(jobId).update({
      applicantIds: firebase.firestore.FieldValue.arrayUnion(currentUser.id)
    });
    showToast("Application submitted successfully!", "success");
  } catch (err) {
    console.error("Apply Job Error:", err);
  }
}

function openApplicantsModal(jobId) {
  const job = appState.jobs.find((j) => j.id === jobId);
  if (!job) return;

  appState.activeApplicantJobId = jobId;
  document.getElementById("applicant-modal-job-title").textContent = job.title;

  const listContainer = document.getElementById("applicants-list-container");
  const applicants = (job.applicantIds || []).map((id) => appState.usersMap[id]).filter(Boolean);

  if (applicants.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        <h3>No applicants yet</h3>
        <p>Check back soon as seekers browse the marketplace!</p>
      </div>
    `;
  } else {
    listContainer.innerHTML = applicants.map((appUser) => {
      const avgRating = appUser.ratings?.length
        ? (appUser.ratings.reduce((a, b) => a + b, 0) / appUser.ratings.length).toFixed(1)
        : "5.0";

      return `
        <div class="applicant-item">
          <div class="applicant-info">
            <div class="profile-avatar-large" style="width: 48px; height: 48px; font-size: 1.5rem;">
              ${appUser.avatar || ''}
            </div>
            <div class="applicant-details">
              <h4>${appUser.name} (${appUser.sex}, ${appUser.age})</h4>
              <p>${avgRating} / 5.0 • ${appUser.completedJobs || 0} completed</p>
              <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">"${appUser.bio}"</p>
            </div>
          </div>

          <button class="btn btn-success btn-sm" onclick="approveApplicant('${job.id}', '${appUser.id}')">
            Approve
          </button>
        </div>
      `;
    }).join("");
  }

  document.getElementById("applicants-modal").classList.add("active");
}

async function approveApplicant(jobId, applicantId) {
  const job = appState.jobs.find((j) => j.id === jobId);
  if (!job) return;

  const applicant = appState.usersMap[applicantId];

  try {
    await db.collection("jobs").doc(jobId).update({
      status: "In Progress",
      approvedApplicantId: applicantId
    });

    const chatId = `chat_${jobId}`;
    await db.collection("chats").doc(chatId).set({
      jobId: jobId,
      posterId: job.posterId,
      applicantId: applicantId,
      messages: [
        {
          id: `msg_${Date.now()}`,
          senderId: "system",
          text: `Applicant ${applicant?.name || ''} was approved! Private workspace initialized.`,
          timestamp: Date.now()
        }
      ]
    });

    closeModal("applicants-modal");
    showToast("Applicant approved & chat initialized!", "success");
    switchTab("chats-view");
    selectChatThread(chatId);
  } catch (err) {
    console.error("Approve Applicant Error:", err);
  }
}

function renderChatsTab() {
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.isNew) return;

  const userChats = appState.chats.filter((c) => c.posterId === currentUser.id || c.applicantId === currentUser.id);

  const badge = document.getElementById("chats-badge");
  if (badge) {
    if (userChats.length > 0) {
      badge.textContent = userChats.length;
      badge.classList.add("active");
    } else {
      badge.classList.remove("active");
    }
  }

  const listContainer = document.getElementById("threads-list-container");
  if (!listContainer) return;

  if (userChats.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state" style="padding: 2rem 1rem;">
        <p>No active conversations yet. Approved jobs will spawn private chat threads here!</p>
      </div>
    `;
    document.getElementById("chat-empty-state").style.display = "block";
    document.getElementById("chat-active-panel").style.display = "none";
    return;
  }

  listContainer.innerHTML = userChats.map((chat) => {
    const job = appState.jobs.find((j) => j.id === chat.jobId) || { title: "Job Task" };
    const partnerId = currentUser.id === chat.posterId ? chat.applicantId : chat.posterId;
    const partner = appState.usersMap[partnerId] || { name: "User", avatar: "" };
    const lastMsg = chat.messages ? chat.messages[chat.messages.length - 1] : null;

    return `
      <div class="thread-item ${appState.activeChatId === chat.id ? 'active' : ''}" onclick="selectChatThread('${chat.id}')">
        <div class="thread-top">
          <span class="thread-job-title">${job.title}</span>
          <span class="thread-time">${lastMsg ? getRelativeTime(lastMsg.timestamp) : ''}</span>
        </div>
        <div class="thread-partner">${partner.avatar || ''} ${partner.name}</div>
        <div class="thread-preview">${lastMsg ? lastMsg.text : 'No messages'}</div>
      </div>
    `;
  }).join("");

  if (appState.activeChatId && userChats.some((c) => c.id === appState.activeChatId)) {
    renderActiveChatPanel();
  }
}

function selectChatThread(chatId) {
  appState.activeChatId = chatId;
  renderChatsTab();
  renderActiveChatPanel();
}

function openJobChat(jobId) {
  let chat = appState.chats.find((c) => c.jobId === jobId);
  if (chat) {
    switchTab("chats-view");
    selectChatThread(chat.id);
  }
}

function renderActiveChatPanel() {
  const currentUser = getCurrentUser();
  const chat = appState.chats.find((c) => c.id === appState.activeChatId);

  const emptyState = document.getElementById("chat-empty-state");
  const activePanel = document.getElementById("chat-active-panel");

  if (!chat) {
    if (emptyState) emptyState.style.display = "block";
    if (activePanel) activePanel.style.display = "none";
    return;
  }

  if (emptyState) emptyState.style.display = "none";
  if (activePanel) activePanel.style.display = "flex";

  const job = appState.jobs.find((j) => j.id === chat.jobId) || { title: "Job Task", status: "In Progress" };
  const partnerId = currentUser.id === chat.posterId ? chat.applicantId : chat.posterId;
  const partner = appState.usersMap[partnerId] || { name: "User", avatar: "" };

  document.getElementById("chat-partner-avatar").textContent = partner.avatar || "";
  document.getElementById("chat-partner-name-display").textContent = partner.name || "User";
  document.getElementById("chat-job-title-display").textContent = `Task: ${job.title} (${job.status})`;

  const isPoster = currentUser.id === job.posterId;
  const completeBtn = document.getElementById("complete-job-btn");
  const terminateBtn = document.getElementById("terminate-job-btn");

  if (completeBtn) {
    completeBtn.style.display = isPoster && job.status === "In Progress" ? "inline-flex" : "none";
  }

  if (terminateBtn) {
    terminateBtn.style.display = job.status === "In Progress" ? "inline-flex" : "none";
  }

  const sendForm = document.getElementById("chat-send-form");
  const inputControl = document.getElementById("chat-input-text");
  if (sendForm && inputControl) {
    if (job.status === "Completed" || job.status === "Terminated") {
      inputControl.disabled = true;
      inputControl.placeholder = `Job is ${job.status.toLowerCase()}. Messaging closed.`;
    } else {
      inputControl.disabled = false;
      inputControl.placeholder = "Type a message...";
    }
  }

  const msgContainer = document.getElementById("chat-messages-container");
  if (msgContainer) {
    msgContainer.innerHTML = (chat.messages || []).map((m) => {
      if (m.senderId === "system") {
        return `<div class="msg-bubble msg-system">${m.text}</div>`;
      }
      const isSent = m.senderId === currentUser.id;
      return `
        <div class="msg-bubble ${isSent ? 'msg-sent' : 'msg-received'}">
          <div>${m.text}</div>
          <div class="msg-meta">${getRelativeTime(m.timestamp)}</div>
        </div>
      `;
    }).join("");

    msgContainer.scrollTop = msgContainer.scrollHeight;
  }
}

async function handleSendChatMessage() {
  const currentUser = getCurrentUser();
  const textInput = document.getElementById("chat-input-text");
  const text = textInput.value.trim();

  if (!text || !appState.activeChatId || !currentUser) return;

  const chat = appState.chats.find((c) => c.id === appState.activeChatId);
  if (!chat) return;

  const job = appState.jobs.find((j) => j.id === chat.jobId);
  if (job && (job.status === "Completed" || job.status === "Terminated")) return;

  const newMsg = {
    id: `msg_${Date.now()}`,
    senderId: currentUser.id,
    text: text,
    timestamp: Date.now()
  };

  try {
    await db.collection("chats").doc(chat.id).update({
      messages: firebase.firestore.FieldValue.arrayUnion(newMsg)
    });
    textInput.value = "";
  } catch (err) {
    console.error("Send Message Error:", err);
  }
}

async function handleTerminateJob(jobId) {
  const confirmTerminate = confirm("Are you sure you want to terminate this job contract?");
  if (!confirmTerminate) return;

  const job = appState.jobs.find((j) => j.id === jobId);
  if (!job) return;

  try {
    await db.collection("jobs").doc(jobId).update({ status: "Terminated" });

    const chatId = `chat_${jobId}`;
    await db.collection("chats").doc(chatId).update({
      messages: firebase.firestore.FieldValue.arrayUnion({
        id: `msg_${Date.now()}`,
        senderId: "system",
        text: "Job contract was terminated due to no agreement.",
        timestamp: Date.now()
      })
    });
    showToast("Job contract terminated", "warning");
  } catch (err) {
    console.error("Terminate Error:", err);
  }
}

function openRatingModal(jobId) {
  appState.ratingTargetJobId = jobId;
  const job = appState.jobs.find((j) => j.id === jobId);
  const currentUser = getCurrentUser();

  if (!job || !currentUser) return;

  if (currentUser.id !== job.posterId) {
    alert("Only the job poster can mark the job as completed and rate the candidate!");
    return;
  }

  const seeker = appState.usersMap[job.approvedApplicantId] || { name: "Seeker" };
  document.getElementById("rating-target-text").textContent = `As the job poster, rate your experience working with seeker ${seeker.name} on "${job.title}":`;

  updateStarUI(5);
  appState.selectedRatingStars = 5;
  document.getElementById("rating-comment-input").value = "";

  document.getElementById("rating-modal").classList.add("active");
}

async function handleRatingSubmit() {
  const currentUser = getCurrentUser();
  const jobId = appState.ratingTargetJobId;
  const stars = appState.selectedRatingStars;
  const comment = document.getElementById("rating-comment-input").value.trim();

  if (!jobId || !comment || !currentUser) return;

  const job = appState.jobs.find((j) => j.id === jobId);
  if (!job || currentUser.id !== job.posterId) return;

  try {
    await db.collection("jobs").doc(jobId).update({ status: "Completed" });

    const seekerId = job.approvedApplicantId;
    const seeker = appState.usersMap[seekerId];

    if (seekerId && seeker) {
      const currentRatings = seeker.ratings || [];
      const currentReviews = seeker.reviews || [];
      const reviewDateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

      await db.collection("users").doc(seekerId).update({
        ratings: [...currentRatings, stars],
        completedJobs: (seeker.completedJobs || 0) + 1,
        reviews: [
          { reviewerName: `${currentUser.name} (Job Poster)`, stars: stars, comment: comment, date: reviewDateStr },
          ...currentReviews
        ]
      });
    }

    const chatId = `chat_${jobId}`;
    await db.collection("chats").doc(chatId).update({
      messages: firebase.firestore.FieldValue.arrayUnion({
        id: `msg_${Date.now()}`,
        senderId: "system",
        text: `Job completed! Poster rated candidate ${stars} Stars.`,
        timestamp: Date.now()
      })
    });

    closeModal("rating-modal");
    showToast("Rating submitted & job completed!", "success");
  } catch (err) {
    console.error("Rating Submit Error:", err);
  }
}

function openEditProfileModal() {
  const currentUser = getCurrentUser();
  if (currentUser && !currentUser.isNew) {
    document.getElementById("user-name-input").value = currentUser.name || "";
    document.getElementById("user-age-input").value = currentUser.age || "";
    document.getElementById("user-sex-input").value = currentUser.sex || "Male";
    document.getElementById("user-bio-input").value = currentUser.bio || "";
  }
  showAuthModal("onboarding");
}

async function handleOnboardingSubmit() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  const name = document.getElementById("user-name-input").value.trim();
  const age = parseInt(document.getElementById("user-age-input").value, 10);
  const sex = document.getElementById("user-sex-input").value;
  const bio = document.getElementById("user-bio-input").value.trim();

  if (!name || !age || !bio) return;

  const avatar = currentUser.avatar || "";

  try {
    await db.collection("users").doc(currentUser.id).set(
      {
        name: name,
        age: age,
        sex: sex,
        bio: bio,
        avatar: avatar,
        email: currentUser.email || "",
        completedJobs: currentUser.completedJobs || 0,
        ratings: currentUser.ratings || [5],
        reviews: currentUser.reviews || [],
        createdAt: currentUser.createdAt || Date.now()
      },
      { merge: true }
    );

    closeModal("auth-modal");
    showToast("Profile details saved!", "success");
  } catch (err) {
    console.error("Save Profile Error:", err);
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove("active");
}
