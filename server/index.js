
require('./worker');

const express = require('express');
const cors = require('cors');
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

const Room = require('./models/Room');
const User = require('./models/User');
const authRoutes = require('./auth');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

/* ============================
   Redis Setup
============================ */

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  console.error('❌ REDIS_URL not set');
  process.exit(1);
}

const redis = new Redis(REDIS_URL);
const sub = new Redis(REDIS_URL);

redis.on('error', err => console.error('❌ Redis error:', err));
sub.on('error', err => console.error('❌ Redis sub error:', err));

/* ============================
   MongoDB Setup
============================ */

const MONGO_URL = process.env.MONGO_URL;
if (!MONGO_URL) {
  console.error('❌ MONGO_URL not set');
  process.exit(1);
}

mongoose
  .connect(MONGO_URL)
  .then(() => console.log('🍃 MongoDB Connected'))
  .catch(err => {
    console.error('❌ MongoDB error:', err);
    process.exit(1);
  });

/* ============================
   HTTP + Socket.io
============================ */

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

/* ============================
   Socket.io State
============================ */

const userSocketMap = {};

function getAllConnectedClients(roomId) {
  return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
    socketId => ({
      socketId,
      username: userSocketMap[socketId]
    })
  );
}

/* ============================
   Socket.io Events
============================ */

io.on('connection', socket => {
  console.log(`🟢 Socket connected: ${socket.id}`);

  socket.on('join_room', ({ roomId, username }) => {
    if (!roomId || !username) return;

    userSocketMap[socket.id] = username;
    socket.join(roomId);

    io.to(roomId).emit('joined', {
      clients: getAllConnectedClients(roomId),
      username,
      socketId: socket.id
    });
  });

  socket.on('send_message', ({ roomId, message, username, time }) => {
    if (!roomId || !message || !username) return;
    if (!message.trim()) return;

    io.to(roomId).emit('receive_message', {
      message,
      username,
      time
    });
  });

  socket.on('disconnecting', () => {
    for (const roomId of socket.rooms) {
      socket.in(roomId).emit('disconnected', {
        socketId: socket.id,
        username: userSocketMap[socket.id]
      });
    }
    delete userSocketMap[socket.id];
  });
});

/* ============================
   Worker Result Listener
============================ */

sub.subscribe('job_results');

sub.on('message', (_, message) => {
  try {
    const { roomId, output, status } = JSON.parse(message);
    if (roomId) {
      io.to(roomId).emit('code_result', { output, status });
    }
  } catch (e) {
    console.error('❌ Job result parse error:', e);
  }
});

/* ============================
   REST API
============================ */

app.get('/health', (_, res) => {
  res.send('CollaborativeCoder API running');
});

app.post('/submit', async (req, res) => {
  try {
    const { sourceCode, language, input, roomId } = req.body;

    if (!sourceCode || !language || !roomId) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const job = {
      jobId: uuidv4(),
      sourceCode,
      language,
      input: input || '',
      roomId
    };

    await redis.rpush('submission_queue', JSON.stringify(job));
    res.status(202).json({ jobId: job.jobId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Submit failed' });
  }
});

app.get('/room/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;

    let room = await Room.findOne({ roomId });
    if (!room) {
      room = await Room.create({ roomId, code: '', language: 'python' });
    }

    res.json(room);
  } catch (err) {
    res.status(500).json({ error: 'Room fetch failed' });
  }
});

app.post('/save', async (req, res) => {
  try {
    const { roomId, code, language } = req.body;

    await Room.findOneAndUpdate(
      { roomId },
      { code: code || '', language: language || 'python' },
      { upsert: true }
    );

    res.json({ message: 'Saved' });
  } catch {
    res.status(500).json({ error: 'Save failed' });
  }
});

app.use('/auth', authRoutes);

app.post('/verify-room', async (req, res) => {
  const { roomId, userId } = req.body;
  if (userId) {
    await User.findByIdAndUpdate(userId, {
      $addToSet: { visitedRooms: roomId }
    });
  }
  res.json({ success: true });
});

app.get('/user-rooms/:userId', async (req, res) => {
  const user = await User.findById(req.params.userId);
  res.json({ rooms: user?.visitedRooms || [] });
});

/* ============================
   Start Server
============================ */

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
