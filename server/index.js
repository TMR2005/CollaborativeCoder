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
dotenv.config();
const app = express();

const REDIS_URL = process.env.REDIS_URL;
const redis = new Redis(REDIS_URL);
const sub = new Redis(REDIS_URL); 

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log('🍃 MongoDB Connected'))
  .catch(err => console.error(err));

sub.subscribe('job_results'); 

sub.on('message', (channel, message) => {
    if (channel === 'job_results') {
        const { roomId, output, status } = JSON.parse(message);
        
        console.log(`📡 Broadcasting result to Room: ${roomId}`);
        
        io.to(roomId).emit('code_result', { output, status });
    }
});

io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    socket.on('join_room', (roomId) => {
        socket.join(roomId);
        console.log(`User ${socket.id} joined room: ${roomId}`);
    });

    socket.on('code_change', (data) => {
        const { roomId, code } = data;
        socket.to(roomId).emit('code_update', code);
    });

    socket.on('disconnect', () => {
        console.log('User Disconnected', socket.id);
    });
});

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

app.get('/room/:roomId', async (req, res) => {
    try {
      const { roomId } = req.params;
      let room = await Room.findOne({ roomId });
  
      if (!room) {
        room = await Room.create({ roomId, code: "", language: "python" });
      }
      
      res.json(room);
    } catch (error) {
      res.status(500).json({ error: "DB Error" });
    }
  });

  app.post('/save', async (req, res) => {
    try {
      const { roomId, code, language } = req.body;
      await Room.findOneAndUpdate(
        { roomId }, 
        { code, language }, 
        { upsert: true, new: true }
      );
      res.json({ message: "Saved" });
    } catch (error) {
      res.status(500).json({ error: "Save Error" });
    }
  });

const authRoutes = require('./auth');


app.use('/auth', authRoutes); 

const User = require('./models/User'); 

app.post('/verify-room', async (req, res) => {
    const { roomId, userId } = req.body;
    
    if (userId) {
        try {
             await User.findByIdAndUpdate(userId, {
                $addToSet: { visitedRooms: roomId } 
             });
        } catch(e) { console.error("History update failed"); }
    }
    
    res.json({ success: true });
});

app.get('/user-rooms/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if(!user) return res.status(404).json({error: "User not found"});
            res.json({ rooms: user.visitedRooms });
    } catch (e) {
        res.status(500).json({error: "Error fetching rooms"});
    }
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});