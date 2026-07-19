// ==========================================================================
// CpE Freelance - Real-Time Core Script (Firebase + Mock Fallback)
// ==========================================================================

// -------------------------------------------------------------
// 1. FIREBASE CONFIGURATION (ENTER YOUR KEYS HERE TO GO LIVE)
// -------------------------------------------------------------
const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

// Check if Firebase keys are provided
const isFirebaseEnabled = firebaseConfig.apiKey && firebaseConfig.apiKey !== "";

let auth, db;
let currentUser = null; // Stores currently logged-in user: { email, name, avatar }
let activeChatJobId = null; // Stores ID of the job currently being chatted about
let chatInterval = null; // Poll interval for chat in mock mode

// -------------------------------------------------------------
// 2. INITIALIZE SERVICES (REAL OR MOCK)
// -------------------------------------------------------------
if (isFirebaseEnabled) {
  // Initialize Real Firebase App
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  console.log("Firebase initialized successfully in LIVE cloud database mode.");
  
  // Real Firebase Auth listener
  auth.onAuthStateChanged(user => {
    if (user) {
      currentUser = {
        email: user.email,
        name: user.displayName,
        avatar: user.photoURL || "👤"
      };
      onLoginSuccess();
    } else {
      currentUser = null;
      onLogoutSuccess();
    }
  });
} else {
  // MOCK MODE: Emulating database using browser localStorage
  console.log("No Firebase API keys found. Initializing in OFFLINE DEMO mode (Mock Firebase).");
  
  // Load currentUser from session to persist login on page refreshes
  const savedUser = sessionStorage.getItem('cpe_user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    setTimeout(onLoginSuccess, 100); // Small delay to let DOM load
  }
  
  // Sync data across multiple open tabs in real-time using Storage events
  window.addEventListener('storage', (e) => {
    if (e.key === 'cpe_mock_jobs' || e.key === 'cpe_mock_chats') {
      renderJobs();
      if (activeChatJobId) {
        renderChatMessages(activeChatJobId);
      }
    }
  });
}

// -------------------------------------------------------------
// 3. SELECT DOM ELEMENTS
// -------------------------------------------------------------
const loginOverlay = document.getElementById('login-overlay');
const googleLoginBtn = document.getElementById('google-login-btn');
const mockUserBtns = document.querySelectorAll('.mock-user-btn');

const userProfileHeader = document.getElementById('user-profile-header');
const userAvatarSpan = document.getElementById('user-avatar');
const userDisplayNameSpan = document.getElementById('user-display-name');
const logoutBtn = document.getElementById('logout-btn');

const jobForm = document.getElementById('cpe-job-form');
const jobNameInput = document.getElementById('job-name');
const jobDurationInput = document.getElementById('job-duration');
const jobDurationUnitSelect = document.getElementById('job-duration-unit');
const jobDescInput = document.getElementById('job-description');

const jobsListContainer = document.getElementById('jobs-list');
const emptyStateContainer = document.getElementById('empty-state');
const jobCountBadge = document.getElementById('job-count');

const chatWidget = document.getElementById('chat-widget');
const chatPartnerName = document.getElementById('chat-partner-name');
const chatJobTitle = document.getElementById('chat-job-title');
const chatMessagesContainer = document.getElementById('chat-messages');
const chatSendForm = document.getElementById('chat-send-form');
const chatInput = document.getElementById('chat-input');
const closeChatBtn = document.getElementById('close-chat-btn');

// -------------------------------------------------------------
// 4. AUTHENTICATION HANDLERS
// -------------------------------------------------------------
// Real Google Authentication
googleLoginBtn.addEventListener('click', () => {
  if (isFirebaseEnabled) {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => {
      alert("Firebase Login Error: " + error.message);
    });
  } else {
    alert("Firebase API keys are not set yet. Please select one of the demo users below to test the site!");
  }
});

// Mock Login click handlers
mockUserBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const email = btn.getAttribute('data-email');
    const name = btn.getAttribute('data-name');
    const avatar = btn.getAttribute('data-avatar');
    
    currentUser = { email, name, avatar };
    sessionStorage.setItem('cpe_user', JSON.stringify(currentUser));
    onLoginSuccess();
  });
});

// Logout handler
logoutBtn.addEventListener('click', () => {
  if (isFirebaseEnabled) {
    auth.signOut();
  } else {
    currentUser = null;
    sessionStorage.removeItem('cpe_user');
    onLogoutSuccess();
  }
});

function onLoginSuccess() {
  loginOverlay.style.display = 'none';
  userProfileHeader.style.display = 'flex';
  userAvatarSpan.textContent = currentUser.avatar;
  userDisplayNameSpan.textContent = currentUser.name;
  
  // Start database listeners
  initializeDatabaseListeners();
}

function onLogoutSuccess() {
  loginOverlay.style.display = 'flex';
  userProfileHeader.style.display = 'none';
  jobsListContainer.innerHTML = '';
  closeChat();
}

// -------------------------------------------------------------
// 5. DATABASE OPERATIONS (CRUD & REAL-TIME LISTENERS)
// -------------------------------------------------------------
function initializeDatabaseListeners() {
  if (isFirebaseEnabled) {
    // Real Firebase: Listen for collection updates
    db.collection('jobs').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
      let firebaseJobs = [];
      snapshot.forEach(doc => {
        firebaseJobs.push({ id: doc.id, ...doc.data() });
      });
      updateJobsUI(firebaseJobs);
    });
  } else {
    // Mock Mode: Sync immediately on login
    renderJobs();
  }
}

// Write job to DB
function postJob(name, duration, durationUnit, description) {
  const newJobData = {
    name: name,
    duration: duration,
    durationUnit: durationUnit,
    description: description,
    clientEmail: currentUser.email,
    clientName: currentUser.name,
    status: 'open', // 'open' or 'progress'
    seekerEmail: '',
    seekerName: '',
    applicants: [], // Array of { email, name, avatar }
    createdAt: Date.now()
  };

  if (isFirebaseEnabled) {
    db.collection('jobs').add(newJobData);
  } else {
    let mockJobs = JSON.parse(localStorage.getItem('cpe_mock_jobs')) || [];
    newJobData.id = Date.now().toString();
    mockJobs.unshift(newJobData); // Add to beginning of array
    localStorage.setItem('cpe_mock_jobs', JSON.stringify(mockJobs));
    renderJobs();
  }
}

// Seeker applies for job
function applyForJob(jobId) {
  if (isFirebaseEnabled) {
    const jobRef = db.collection('jobs').doc(jobId);
    db.runTransaction(transaction => {
      return transaction.get(jobRef).then(doc => {
        if (!doc.exists) return;
        let applicants = doc.data().applicants || [];
        // Check if already applied
        if (!applicants.some(a => a.email === currentUser.email)) {
          applicants.push({
            email: currentUser.email,
            name: currentUser.name,
            avatar: currentUser.avatar
          });
          transaction.update(jobRef, { applicants: applicants });
        }
      });
    });
  } else {
    let mockJobs = JSON.parse(localStorage.getItem('cpe_mock_jobs')) || [];
    const job = mockJobs.find(j => j.id === jobId);
    if (job && !job.applicants.some(a => a.email === currentUser.email)) {
      job.applicants.push({
        email: currentUser.email,
        name: currentUser.name,
        avatar: currentUser.avatar
      });
      localStorage.setItem('cpe_mock_jobs', JSON.stringify(mockJobs));
      renderJobs();
    }
  }
}

// Client approves seeker from queue
function approveSeeker(jobId, seekerEmail, seekerName) {
  if (isFirebaseEnabled) {
    db.collection('jobs').doc(jobId).update({
      status: 'progress',
      seekerEmail: seekerEmail,
      seekerName: seekerName
    });
  } else {
    let mockJobs = JSON.parse(localStorage.getItem('cpe_mock_jobs')) || [];
    const job = mockJobs.find(j => j.id === jobId);
    if (job) {
      job.status = 'progress';
      job.seekerEmail = seekerEmail;
      job.seekerName = seekerName;
      localStorage.setItem('cpe_mock_jobs', JSON.stringify(mockJobs));
      renderJobs();
    }
  }
}

// -------------------------------------------------------------
// 6. JOBS UI RENDERING
// -------------------------------------------------------------
function renderJobs() {
  if (isFirebaseEnabled) return; // Handled by Firebase onSnapshot
  let mockJobs = JSON.parse(localStorage.getItem('cpe_mock_jobs')) || [];
  updateJobsUI(mockJobs);
}

function updateJobsUI(jobsList) {
  jobsListContainer.innerHTML = '';
  jobCountBadge.textContent = jobsList.length;

  if (jobsList.length === 0) {
    emptyStateContainer.style.display = 'block';
    return;
  }
  
  emptyStateContainer.style.display = 'none';

  jobsList.forEach(job => {
    const card = document.createElement('div');
    card.className = `job-card status-${job.status}`;
    
    const isOwner = job.clientEmail === currentUser.email;
    const hasApplied = job.applicants.some(a => a.email === currentUser.email);
    const isApprovedSeeker = job.seekerEmail === currentUser.email;

    // Badges layout
    const statusText = job.status === 'open' ? 'Open' : 'In Progress';
    const statusClass = job.status === 'open' ? 'open' : 'progress';

    let footerActionHtml = '';

    if (job.status === 'open') {
      if (isOwner) {
        // Owner view: Show applicant list queue
        let queueHtml = '';
        if (job.applicants.length === 0) {
          queueHtml = `<p style="font-size:0.85rem; color:var(--text-muted);">No candidates queued yet.</p>`;
        } else {
          queueHtml = `<ul class="applicant-list">`;
          job.applicants.forEach(applicant => {
            queueHtml += `
              <li class="applicant-item">
                <span class="applicant-info">
                  <span>${applicant.avatar}</span> ${escapeHTML(applicant.name)}
                </span>
                <button class="btn-approve" onclick="handleApprove('${job.id}', '${applicant.email}', '${escapeHTML(applicant.name)}')">Approve</button>
              </li>
            `;
          });
          queueHtml += `</ul>`;
        }

        footerActionHtml = `
          <div class="queue-section">
            <h4>Applicant Queue (${job.applicants.length})</h4>
            ${queueHtml}
          </div>
        `;
      } else {
        // Seeker view: Show apply button
        if (hasApplied) {
          footerActionHtml = `
            <div class="card-actions">
              <button class="btn btn-apply" disabled>Applied (Queue Position: ${job.applicants.findIndex(a => a.email === currentUser.email) + 1})</button>
            </div>
          `;
        } else {
          footerActionHtml = `
            <div class="card-actions">
              <button class="btn btn-apply" onclick="handleApply('${job.id}')">Apply for Job</button>
            </div>
          `;
        }
      }
    } else if (job.status === 'progress') {
      // In Progress status: Show Chat controls for involved parties
      if (isOwner) {
        footerActionHtml = `
          <div class="card-actions">
            <span style="font-size:0.85rem; color:var(--text-muted); align-self:center; margin-right:auto;">Assigned to: <b>${escapeHTML(job.seekerName)}</b></span>
            <button class="btn btn-chat-trigger" onclick="openChat('${job.id}', '${job.seekerEmail}', '${escapeHTML(job.seekerName)}', '${escapeHTML(job.name)}')">Chat with Seeker</button>
          </div>
        `;
      } else if (isApprovedSeeker) {
        footerActionHtml = `
          <div class="card-actions">
            <span style="font-size:0.85rem; color:var(--text-muted); align-self:center; margin-right:auto;">You have been approved!</span>
            <button class="btn btn-chat-trigger" onclick="openChat('${job.id}', '${job.clientEmail}', '${escapeHTML(job.clientName)}', '${escapeHTML(job.name)}')">Chat with Client</button>
          </div>
        `;
      } else {
        footerActionHtml = `
          <div class="card-actions">
            <span style="font-size:0.85rem; color:var(--text-muted);">This job is filled and in progress.</span>
          </div>
        `;
      }
    }

    card.innerHTML = `
      <div class="job-card-header">
        <div class="job-card-title-block">
          <h3 class="job-card-title">${escapeHTML(job.name)}</h3>
          <span class="job-posted-by">Posted by: ${escapeHTML(job.clientName)} ${isOwner ? '(You)' : ''}</span>
        </div>
        <div class="job-card-badges">
          <span class="status-badge ${statusClass}">${statusText}</span>
          <span class="job-time-badge">⏱️ ${job.duration} ${job.durationUnit}</span>
        </div>
      </div>
      <p class="job-card-desc">${escapeHTML(job.description)}</p>
      ${footerActionHtml}
    `;

    jobsListContainer.appendChild(card);
  });
}

// Global button interceptors
window.handleApply = function(jobId) {
  applyForJob(jobId);
};

window.handleApprove = function(jobId, email, name) {
  approveSeeker(jobId, email, name);
};

// -------------------------------------------------------------
// 7. REAL-TIME CHAT LOGIC
// -------------------------------------------------------------
function openChat(jobId, partnerEmail, partnerName, jobTitle) {
  activeChatJobId = jobId;
  chatPartnerName.textContent = partnerName;
  chatJobTitle.textContent = jobTitle;
  chatWidget.style.display = 'flex';
  
  // Render messages immediately
  renderChatMessages(jobId);
  
  // Real-time synchronization
  if (isFirebaseEnabled) {
    // Firebase real-time collection subscription
    if (window.chatUnsubscribe) window.chatUnsubscribe();
    
    window.chatUnsubscribe = db.collection('chats')
      .where('jobId', '==', jobId)
      .orderBy('timestamp', 'asc')
      .onSnapshot(snapshot => {
        let messages = [];
        snapshot.forEach(doc => {
          messages.push(doc.data());
        });
        updateChatUI(messages);
      });
  } else {
    // Mock Mode: Poll to mock real-time chat between tabs
    if (chatInterval) clearInterval(chatInterval);
    chatInterval = setInterval(() => {
      renderChatMessages(jobId);
    }, 1500);
  }
}

function closeChat() {
  activeChatJobId = null;
  chatWidget.style.display = 'none';
  if (window.chatUnsubscribe) window.chatUnsubscribe();
  if (chatInterval) clearInterval(chatInterval);
}

closeChatBtn.addEventListener('click', closeChat);

function sendChatMessage(text) {
  if (!activeChatJobId) return;

  const msgData = {
    jobId: activeChatJobId,
    senderEmail: currentUser.email,
    senderName: currentUser.name,
    text: text,
    timestamp: Date.now()
  };

  if (isFirebaseEnabled) {
    db.collection('chats').add(msgData);
  } else {
    let mockChats = JSON.parse(localStorage.getItem('cpe_mock_chats')) || [];
    mockChats.push(msgData);
    localStorage.setItem('cpe_mock_chats', JSON.stringify(mockChats));
    renderChatMessages(activeChatJobId);
  }
}

function renderChatMessages(jobId) {
  let mockChats = JSON.parse(localStorage.getItem('cpe_mock_chats')) || [];
  let jobMessages = mockChats.filter(m => m.jobId === jobId)
                              .sort((a,b) => a.timestamp - b.timestamp);
  updateChatUI(jobMessages);
}

function updateChatUI(messages) {
  chatMessagesContainer.innerHTML = '';
  
  messages.forEach(msg => {
    const bubble = document.createElement('div');
    const isOutgoing = msg.senderEmail === currentUser.email;
    bubble.className = `msg-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`;
    bubble.textContent = msg.text;
    
    chatMessagesContainer.appendChild(bubble);
  });
  
  // Auto-scroll chat body to bottom
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

// Chat input form submit
chatSendForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  
  sendChatMessage(text);
  chatInput.value = '';
});

// -------------------------------------------------------------
// 8. FORM SUBMISSION
// -------------------------------------------------------------
jobForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const name = jobNameInput.value.trim();
  const duration = parseInt(jobDurationInput.value);
  const unit = jobDurationUnitSelect.value;
  const desc = jobDescInput.value.trim();
  
  if (!name || !duration || !desc) return;
  
  postJob(name, duration, unit, desc);
  jobForm.reset();
});

// -------------------------------------------------------------
// 9. SECURITY HELPER
// -------------------------------------------------------------
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}
