// ==========================================================================
// CpE Freelance - Real-Time Core Script (Firebase Mode Only)
// ==========================================================================

// -------------------------------------------------------------
// 1. FIREBASE CONFIGURATION (ENTER YOUR KEYS HERE TO GO LIVE)
// -------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyD4Js1lZ1SSLiAv6JiHevau5TlIdA2vzVY",
  authDomain: "freelance-9d09d.firebaseapp.com",
  projectId: "freelance-9d09d",
  storageBucket: "freelance-9d09d.firebasestorage.app",
  messagingSenderId: "133455816148",
  appId: "1:133455816148:web:81ae5e50d658faabd6a241",
  measurementId: "G-SET64JC8HH"
};

// Initialize Firebase App
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
console.log("Firebase initialized successfully in LIVE cloud database mode.");

let currentUser = null; // Stores currently logged-in user: { email, name, avatar }
let activeChatJobId = null; // Stores ID of the job currently being chatted about

// Check for existing session on page load
const savedUser = sessionStorage.getItem('cpe_user_session');
if (savedUser) {
  currentUser = JSON.parse(savedUser);
  // Small delay to let DOM load fully
  setTimeout(onLoginSuccess, 100);
}

// -------------------------------------------------------------
// 3. SELECT DOM ELEMENTS
// -------------------------------------------------------------
const loginOverlay = document.getElementById('login-overlay');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username-input');

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
// Name-based Login Form handler
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = usernameInput.value.trim();
  if (!name) return;

  currentUser = {
    email: name.toLowerCase().replace(/\s+/g, '') + "@cpe.edu",
    name: name,
    avatar: "👤"
  };

  sessionStorage.setItem('cpe_user_session', JSON.stringify(currentUser));
  onLoginSuccess();
});

// Logout handler
logoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem('cpe_user_session');
  currentUser = null;
  onLogoutSuccess();
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
  // Real Firebase: Listen for collection updates
  db.collection('jobs').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
    let firebaseJobs = [];
    snapshot.forEach(doc => {
      firebaseJobs.push({ id: doc.id, ...doc.data() });
    });
    updateJobsUI(firebaseJobs);
  }, error => {
    console.error("Firestore onSnapshot error: ", error);
    alert("Firebase Database Error: " + error.message + "\n\nTip: Please verify that you configured your Cloud Firestore Security Rules to allow public reads and writes during development!");
  });
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

  db.collection('jobs').add(newJobData)
    .then((docRef) => {
      console.log("Job posted successfully with ID: ", docRef.id);
    })
    .catch(error => {
      console.error("Error posting job to Firestore: ", error);
      alert("Failed to post job: " + error.message + "\n\nTip: Ensure your Cloud Firestore Security Rules permit public writes during development!");
    });
}

// Seeker applies for job
function applyForJob(jobId) {
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
  })
  .then(() => {
    console.log("Application transaction completed successfully.");
  })
  .catch(error => {
    console.error("Application transaction failed: ", error);
    alert("Failed to apply for job: " + error.message);
  });
}

// Client approves seeker from queue
function approveSeeker(jobId, seekerEmail, seekerName) {
  db.collection('jobs').doc(jobId).update({
    status: 'progress',
    seekerEmail: seekerEmail,
    seekerName: seekerName
  })
  .then(() => {
    console.log("Seeker approved successfully.");
  })
  .catch(error => {
    console.error("Error approving seeker: ", error);
    alert("Failed to approve seeker: " + error.message);
  });
}

// -------------------------------------------------------------
// 6. JOBS UI RENDERING
// -------------------------------------------------------------

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
    }, error => {
      console.error("Chat onSnapshot error: ", error);
      alert("Failed to load chat messages: " + error.message);
    });
}

function closeChat() {
  activeChatJobId = null;
  chatWidget.style.display = 'none';
  if (window.chatUnsubscribe) window.chatUnsubscribe();
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

  db.collection('chats').add(msgData)
    .catch(error => {
      console.error("Error sending chat message: ", error);
      alert("Failed to send message: " + error.message);
    });
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
