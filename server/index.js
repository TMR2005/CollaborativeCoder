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

/* ============================
   Middleware
============================ */

app.use(
  cors({
    origin: true,
    credentials: true
  })
);

app.use(express.json());

/* ============================
   Redis
============================ */

const redis = new Redis(process.env.REDIS_URL);
const sub = new Redis(process.env.REDIS_URL);

redis.on('error', err => {
  console.error('❌ Redis:', err);
});

sub.on('error', err => {
  console.error('❌ Redis Subscriber:', err);
});

/* ============================
   MongoDB
============================ */

mongoose
  .connect(process.env.MONGO_URL)
  .then(() =>
    console.log('🍃 MongoDB Connected')
  )
  .catch(err => {
    console.error(err);
    process.exit(1);
  });

/* ============================
   HTTP + Socket
============================ */

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
    credentials: true
  },

  transports: ['websocket'],

  pingTimeout: 60000,
  pingInterval: 25000
});

/* ============================
   Socket State
============================ */

const userSocketMap = {};

function getAllConnectedClients(roomId) {
  return Array.from(
    io.sockets.adapter.rooms.get(roomId) || []
  ).map(socketId => ({
    socketId,
    username: userSocketMap[socketId]
  }));
}

/* ============================
   Socket Events
============================ */

io.on('connection', socket => {

  console.log(
    `🟢 Socket Connected: ${socket.id}`
  );

  console.log(
    `Transport: ${socket.conn.transport.name}`
  );

  socket.on(
    'join_room',
    ({ roomId, username }) => {

      if (!roomId || !username)
        return;

      userSocketMap[socket.id] =
        username;

      socket.join(roomId);

      console.log(
        `✅ ${username} joined ${roomId}`
      );

      console.log(
        'Room members:',
        io.sockets.adapter.rooms.get(
          roomId
        )
      );

      io.to(roomId).emit(
        'joined',
        {
          clients:
            getAllConnectedClients(
              roomId
            ),
          username,
          socketId:
            socket.id
        }
      );
    }
  );

  socket.on(
    'code_change',
    ({ roomId, code }) => {

      socket
        .to(roomId)
        .emit(
          'code_update',
          code
        );

    }
  );

  socket.on(
    'disconnect',
    reason => {

      console.log(
        `🔴 ${socket.id}`
      );

      console.log(
        `Reason: ${reason}`
      );

      delete userSocketMap[
        socket.id
      ];
    }
  );

});

/* ============================
   Worker Result
============================ */

sub.subscribe(
  'job_results'
);

sub.on(
  'message',
  (_, message) => {

    try {

      const parsed =
        JSON.parse(
          message
        );

      console.log(
        '📥 Worker:',
        parsed
      );

      const {
        roomId,
        output,
        status
      } = parsed;

      console.log(
        'Clients:',
        io.sockets.adapter.rooms.get(
          roomId
        )
      );

      io.to(roomId)
        .emit(
          'code_result',
          {
            output,
            status
          }
        );

      console.log(
        `📤 Sent -> ${roomId}`
      );

    } catch(err){

      console.error(err);

    }

  }
);

/* ============================
   Submit
============================ */

app.post(
  '/submit',
  async(req,res)=>{

    try{

      const {
        sourceCode,
        language,
        input,
        roomId
      } = req.body;

      const job = {

        jobId:
          uuidv4(),

        sourceCode,
        language,
        input:
          input || '',

        roomId
      };

      await redis.rpush(
        'submission_queue',
        JSON.stringify(job)
      );

      console.log(
        `📦 Queued ${job.jobId}`
      );

      res
        .status(202)
        .json({
          success:true
        });

    }
    catch(err){

      console.error(err);

      res
        .status(500)
        .json({
          error:'Submit failed'
        });

    }

  }
);

app.use(
  '/auth',
  authRoutes
);

const PORT =
  process.env.PORT || 5000;

server.listen(
  PORT,
  ()=>{

    console.log(
      `🚀 Running on ${PORT}`
    );

  }
);
