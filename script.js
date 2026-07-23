const socket = io();

// ---- Screens ----
const screens = {
  landing: document.getElementById('screen-landing'),
  waiting: document.getElementById('screen-waiting'),
  chat: document.getElementById('screen-chat'),
};

function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

// ---- Landing ----
const interestsInput = document.getElementById('interests-input');
document.getElementById('btn-start').addEventListener('click', startSearch);
interestsInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startSearch();
});

function startSearch() {
  const raw = interestsInput.value.trim();
  const interests = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  clearMessages();
  showScreen('waiting');
  socket.emit('find', { interests });
}

document.getElementById('btn-cancel-wait').addEventListener('click', () => {
  socket.emit('leave');
  showScreen('landing');
});

// ---- Chat elements ----
const messagesEl = document.getElementById('messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const typingRow = document.getElementById('typing-row');
const statusDot = document.getElementById('status-dot');
const statusTitle = document.getElementById('status-title');
const statusSub = document.getElementById('status-sub');

function clearMessages() {
  messagesEl.innerHTML = '';
}

function addMessage(text, kind) {
  const div = document.createElement('div');
  div.className = `msg msg-${kind}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setConnectedStatus() {
  statusDot.classList.remove('partner-left');
  statusTitle.textContent = 'Locked on';
  statusSub.textContent = 'Stranger connected';
}

function setPartnerLeftStatus() {
  statusDot.classList.add('partner-left');
  statusTitle.textContent = 'Signal lost';
  statusSub.textContent = 'Stranger disconnected';
}

// ---- Socket events ----
socket.on('status', ({ state }) => {
  if (state === 'waiting') {
    showScreen('waiting');
  } else if (state === 'connected') {
    clearMessages();
    setConnectedStatus();
    showScreen('chat');
    addMessage("You're connected. Say hi — be kind, stay anonymous.", 'system');
    messageInput.focus();
  } else if (state === 'partner_left') {
    setPartnerLeftStatus();
    typingRow.classList.remove('visible');
    document.getElementById('modal-partner-left').classList.remove('hidden');
  } else if (state === 'rate_limited') {
    addMessage("You're sending messages too fast — slow down a bit.", 'system');
  } else if (state === 'idle') {
    showScreen('landing');
  }
});

socket.on('message', ({ text }) => {
  typingRow.classList.remove('visible');
  addMessage(text, 'them');
});

let typingTimeout = null;
socket.on('typing', (isTyping) => {
  if (isTyping) {
    typingRow.classList.add('visible');
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => typingRow.classList.remove('visible'), 3000);
  } else {
    typingRow.classList.remove('visible');
  }
});

// ---- Sending messages ----
messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;
  socket.emit('message', text);
  addMessage(text, 'me');
  messageInput.value = '';
  socket.emit('typing', false);
});

let typingSentAt = 0;
messageInput.addEventListener('input', () => {
  const now = Date.now();
  if (now - typingSentAt > 800) {
    socket.emit('typing', true);
    typingSentAt = now;
  }
});

// ---- Header actions ----
document.getElementById('btn-skip').addEventListener('click', () => {
  clearMessages();
  showScreen('waiting');
  socket.emit('skip');
});

document.getElementById('btn-leave').addEventListener('click', () => {
  socket.emit('leave');
  showScreen('landing');
});

// ---- Partner-left modal ----
const modalPartnerLeft = document.getElementById('modal-partner-left');
document.getElementById('btn-modal-find').addEventListener('click', () => {
  modalPartnerLeft.classList.add('hidden');
  clearMessages();
  showScreen('waiting');
  socket.emit('find', {});
});
document.getElementById('btn-modal-close').addEventListener('click', () => {
  modalPartnerLeft.classList.add('hidden');
  showScreen('landing');
});

// ---- Report modal ----
const modalReport = document.getElementById('modal-report');
document.getElementById('btn-report').addEventListener('click', () => {
  modalReport.classList.remove('hidden');
});
document.getElementById('btn-report-cancel').addEventListener('click', () => {
  modalReport.classList.add('hidden');
});
document.querySelectorAll('.report-reason').forEach((btn) => {
  btn.addEventListener('click', () => {
    socket.emit('report', btn.dataset.reason);
    modalReport.classList.add('hidden');
    addMessage('Report sent. Finding you a new stranger.', 'system');
  });
});
