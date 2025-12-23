require('./worker');
const express = require('express');
const cors = require('cors');
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const Room = require('./models/Room');
const dotenv = require('dotenv');
const { WebSocketServer } = require('ws');
const { setupWSConnection } = require('y-websocket');



dotenv.config();
const app = express();

// --- Redis & DB Setup ---
const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  console.error('❌ REDIS_URL environment variable is not set');
  process.exit(1);
}

const redis = new Redis(REDIS_URL);
const sub = new Redis(REDIS_URL);

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err);
});

sub.on('error', (err) => {
  console.error('❌ Redis subscription error:', err);
});

const MONGO_URL = process.env.MONGO_URL;
if (!MONGO_URL) {
  console.error('❌ MONGO_URL environment variable is not set');
  process.exit(1);
}

mongoose.connect(MONGO_URL)
  .then(() => console.log('🍃 MongoDB Connected'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// --- Server Setup ---
const server = http.createServer(app);

// 1. Socket.io Server (Chat + Execution)
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 2. Yjs WebSocket Server (CRDT Text Sync)
const wss = new WebSocketServer({ noServer: true });

// 3. Handle Upgrade Requests (Route traffic to correct handler)
server.on('upgrade', (request, socket, head) => {
    // Socket.io connections start with /socket.io/
    if (request.url.startsWith('/socket.io/')) {
        // Let Socket.io handle it naturally
        return; 
    }

    // All other WebSocket connections go to Yjs (The URL is the room name)
    wss.handleUpgrade(request, socket, head, (ws) => {
        setupWSConnection(ws, request);
    });
});

// --- STATE MANAGEMENT (Socket.io) ---
// Map socketId -> Username (to track who is who for Chat/Sidebar)
const userSocketMap = {};

function getAllConnectedClients(roomId) {
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map((socketId) => {
        return {
            socketId,
            username: userSocketMap[socketId],
        };
    });
}

// --- SOCKET.IO HANDLERS ---
io.on('connection', (socket) => {
    console.log(`Socket.io User Connected: ${socket.id}`);

    // JOIN ROOM (Chat/Sidebar presence)
    socket.on('join_room', ({ roomId, username }) => {
        if (!roomId || !username) {
            socket.emit('error', { message: 'Room ID and username are required' });
            return;
        }
        
        userSocketMap[socket.id] = username;
        socket.join(roomId);
        
        const clients = getAllConnectedClients(roomId);
        
        // Notify room
        io.to(roomId).emit('joined', {
            clients,
            username,
            socketId: socket.id,
        });
    });

    // GROUP CHAT
    socket.on('send_message', ({ roomId, message, username, time }) => {
        if (!roomId || !message || !username) {
            socket.emit('error', { message: 'Room ID, message, and username are required' });
            return;
        }
        
        // Basic message validation
        if (message.trim().length === 0) {
            return; // Ignore empty messages
        }
        
        if (message.length > 1000) {
            socket.emit('error', { message: 'Message too long (max 1000 characters)' });
            return;
        }
        
        io.to(roomId).emit('receive_message', { message, username, time });
    });

    // DISCONNECT
    socket.on('disconnecting', () => {
        const rooms = [...socket.rooms];
        rooms.forEach((roomId) => {
            socket.in(roomId).emit('disconnected', {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            });
        });
        delete userSocketMap[socket.id];
        socket.leave();
    });
});

// --- WORKER RESULT LISTENER ---
sub.subscribe('job_results');

sub.on('message', (channel, message) => {
    if (channel === 'job_results') {
        try {
            const { roomId, output, status } = JSON.parse(message);
            if (roomId) {
                console.log(`📡 Broadcasting result to Room: ${roomId}`);
                io.to(roomId).emit('code_result', { output, status });
            }
        } catch (error) {
            console.error('Error parsing job result:', error);
        }
    }
});

// --- API ROUTES ---
app.use(express.json());
app.use(cors());

app.get('/health', (req, res) => {
  res.send('Hello! The Collaborative Judge API is running.');
});

app.post('/submit', async (req, res) => {
    try {
        const { sourceCode, language, input, roomId } = req.body;
        
        if (!sourceCode || !language || !roomId) {
            return res.status(400).json({ error: "Missing Source Code, Language, or Room ID" });
        }

        // Validate language
        const validLanguages = ['python', 'cpp', 'javascript'];
        if (!validLanguages.includes(language)) {
            return res.status(400).json({ error: `Invalid language. Supported: ${validLanguages.join(', ')}` });
        }

        // Validate source code length
        if (sourceCode.length > 100000) {
            return res.status(400).json({ error: "Source code too long (max 100KB)" });
        }

        const jobData = {
            jobId: uuidv4(),
            sourceCode,
            language,
            input: input || "",
            roomId
        };

        await redis.rpush('submission_queue', JSON.stringify(jobData));
        
        res.status(202).json({
            message: "Your request is in the queue",
            jobId: jobData.jobId
        });
    } catch (error) {
        console.error('Error in /submit:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Load Code from DB (Fallback/Initial Load)
app.get('/room/:roomId', async (req, res) => {
    try {
      const { roomId } = req.params;
      
      if (!roomId || roomId.trim().length === 0) {
        return res.status(400).json({ error: "Invalid room ID" });
      }
      
      let room = await Room.findOne({ roomId });
  
      if (!room) {
        room = await Room.create({ roomId, code: "", language: "python" });
      }
      
      res.json(room);
    } catch (error) {
      console.error('Error in /room/:roomId:', error);
      res.status(500).json({ error: "Database error occurred" });
    }
});

// Save Code to DB
app.post('/save', async (req, res) => {
    try {
      const { roomId, code, language } = req.body;
      
      if (!roomId) {
        return res.status(400).json({ error: "Room ID is required" });
      }
      
      // Validate language if provided
      if (language) {
        const validLanguages = ['python', 'cpp', 'javascript'];
        if (!validLanguages.includes(language)) {
          return res.status(400).json({ error: `Invalid language. Supported: ${validLanguages.join(', ')}` });
        }
      }
      
      await Room.findOneAndUpdate(
        { roomId }, 
        { code: code || "", language: language || "python" }, 
        { upsert: true, new: true }
      );
      res.json({ message: "Saved" });
    } catch (error) {
      console.error('Error in /save:', error);
      res.status(500).json({ error: "Failed to save code" });
    }
});

const authRoutes = require('./auth');
app.use('/auth', authRoutes);

const User = require('./models/User');

app.post('/verify-room', async (req, res) => {
    try {
        const { roomId, userId } = req.body;
        
        if (!roomId) {
            return res.status(400).json({ error: "Room ID is required" });
        }
        
        if (userId) {
            try {
                await User.findByIdAndUpdate(userId, {
                    $addToSet: { visitedRooms: roomId } 
                });
            } catch(e) { 
                console.error("History update failed:", e);
                // Don't fail the request if history update fails
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error in /verify-room:', error);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get('/user-rooms/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.status(400).json({ error: "User ID is required" });
        }
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        
        res.json({ rooms: user.visitedRooms || [] });
    } catch (error) {
        console.error('Error in /user-rooms/:userId:', error);
        res.status(500).json({ error: "Error fetching rooms" });
    }
});

// --- SERVER START ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});