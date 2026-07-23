const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' } // tighten this to your real domain in production
});

app.use(express.static(path.join(__dirname, 'public')));

// ---- In-memory matchmaking state ----
// NOTE: in-memory state means this only works on a single server process.
// For multiple instances/scaling, move waitingQueue + pairs into Redis.
const waitingQueue = []; // array of socket ids, in FIFO order
const pairs = new Map(); // socketId -> partnerSocketId
const interests = new Map(); // socketId -> string[] (lowercased tags)
const lastMessageTimes = new Map(); // socketId -> array of timestamps (basic rate limit)

const MAX_MESSAGE_LENGTH = 1000;
const RATE_LIMIT_WINDOW_MS = 10000;
const RATE_LIMIT_MAX_MESSAGES = 25;

function removeFromQueue(socketId) {
  const idx = waitingQueue.indexOf(socketId);
  if (idx !== -1) waitingQueue.splice(idx, 1);
}

function findMatchFor(socketId) {
  const myInterests = interests.get(socketId) || [];

  // Prefer someone in the queue who shares an interest tag
  if (myInterests.length > 0) {
    for (const candidateId of waitingQueue) {
      const theirInterests = interests.get(candidateId) || [];
      if (theirInterests.some((t) => myInterests.includes(t))) {
        return candidateId;
      }
    }
  }
  // Otherwise just take the first person waiting
  return waitingQueue.length > 0 ? waitingQueue[0] : null;
}

function tryMatch(socket) {
  const partnerId = findMatchFor(socket.id);
  if (!partnerId) {
    waitingQueue.push(socket.id);
    socket.emit('status', { state: 'waiting' });
    return;
  }

  removeFromQueue(partnerId);
  pairs.set(socket.id, partnerId);
  pairs.set(partnerId, socket.id);

  const partnerSocket = io.sockets.sockets.get(partnerId);
  if (!partnerSocket) {
    // partner vanished between queue check and now; retry
    pairs.delete(socket.id);
    waitingQueue.push(socket.id);
    socket.emit('status', { state: 'waiting' });
    return;
  }

  socket.emit('status', { state: 'connected' });
  partnerSocket.emit('status', { state: 'connected' });
}

function endPair(socketId, { notifyPartner = true, requeuePartner = false } = {}) {
  const partnerId = pairs.get(socketId);
  pairs.delete(socketId);
  if (partnerId) {
    pairs.delete(partnerId);
    if (notifyPartner) {
      const partnerSocket = io.sockets.sockets.get(partnerId);
      if (partnerSocket) {
        partnerSocket.emit('status', { state: 'partner_left' });
        if (requeuePartner) tryMatch(partnerSocket);
      }
    }
  }
  return partnerId;
}

function isRateLimited(socketId) {
  const now = Date.now();
  const times = (lastMessageTimes.get(socketId) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  times.push(now);
  lastMessageTimes.set(socketId, times);
  return times.length > RATE_LIMIT_MAX_MESSAGES;
}

io.on('connection', (socket) => {
  socket.emit('status', { state: 'idle' });

  socket.on('find', (payload = {}) => {
    removeFromQueue(socket.id);
    endPair(socket.id, { notifyPartner: true, requeuePartner: true });

    const tags = Array.isArray(payload.interests)
      ? payload.interests
          .map((t) => String(t).toLowerCase().trim())
          .filter(Boolean)
          .slice(0, 5)
      : [];
    interests.set(socket.id, tags);

    tryMatch(socket);
  });

  socket.on('message', (text) => {
    const partnerId = pairs.get(socket.id);
    if (!partnerId) return;
    if (typeof text !== 'string') return;
    const trimmed = text.slice(0, MAX_MESSAGE_LENGTH).trim();
    if (!trimmed) return;
    if (isRateLimited(socket.id)) {
      socket.emit('status', { state: 'rate_limited' });
      return;
    }
    const partnerSocket = io.sockets.sockets.get(partnerId);
    if (partnerSocket) {
      partnerSocket.emit('message', { text: trimmed, at: Date.now() });
    }
  });

  socket.on('typing', (isTyping) => {
    const partnerId = pairs.get(socket.id);
    if (!partnerId) return;
    const partnerSocket = io.sockets.sockets.get(partnerId);
    if (partnerSocket) partnerSocket.emit('typing', !!isTyping);
  });

  socket.on('skip', () => {
    removeFromQueue(socket.id);
    endPair(socket.id, { notifyPartner: true, requeuePartner: true });
    tryMatch(socket);
  });

  socket.on('report', (reason) => {
    const partnerId = pairs.get(socket.id);
    // In production: persist this report (id, partnerId, reason, timestamp) to a
    // moderation queue/database instead of just logging it.
    console.warn(
      `[report] ${socket.id} reported ${partnerId || 'unknown'}: ${String(
        reason || ''
      ).slice(0, 300)}`
    );
    endPair(socket.id, { notifyPartner: true, requeuePartner: true });
    socket.emit('status', { state: 'idle' });
  });

  socket.on('leave', () => {
    removeFromQueue(socket.id);
    endPair(socket.id, { notifyPartner: true, requeuePartner: true });
    socket.emit('status', { state: 'idle' });
  });

  socket.on('disconnect', () => {
    removeFromQueue(socket.id);
    endPair(socket.id, { notifyPartner: true, requeuePartner: true });
    interests.delete(socket.id);
    lastMessageTimes.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Signal running on http://localhost:${PORT}`);
});
