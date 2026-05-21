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

const redis = new Redis(
  process.env.REDIS_URL
);

const sub = new Redis(
  process.env.REDIS_URL
);

redis.on('error', err => {
  console.error(
    '❌ Redis Error:',
    err
  );
});

sub.on('error', err => {
  console.error(
    '❌ Redis Sub Error:',
    err
  );
});

/* ============================
   MongoDB
============================ */

mongoose
  .connect(process.env.MONGO_URL)
  .then(() =>
    console.log(
      '🍃 MongoDB Connected'
    )
  )
  .catch(err => {

    console.error(
      '❌ MongoDB Error:',
      err
    );

    process.exit(1);
  });

/* ============================
   HTTP + Socket.io
============================ */

const server =
  http.createServer(app);

const io = new Server(
  server,
  {
    cors: {
      origin: true,
      methods: [
        'GET',
        'POST'
      ],
      credentials: true
    },

    pingTimeout: 60000,
    pingInterval: 25000
  }
);

/* ============================
   Socket State
============================ */

const userSocketMap = {};

function getAllConnectedClients(
  roomId
) {

  return Array.from(
    io.sockets.adapter.rooms.get(
      roomId
    ) || []
  ).map(socketId => ({
    socketId,
    username:
      userSocketMap[
        socketId
      ]
  }));
}

/* ============================
   Socket Events
============================ */

io.on(
  'connection',
  socket => {

    console.log(
      `🟢 Socket Connected: ${socket.id}`
    );

    console.log(
      `Transport: ${socket.conn.transport.name}`
    );

    socket.conn.on(
      'upgrade',
      transport => {

        console.log(
          `⬆️ Upgraded → ${transport.name}`
        );

      }
    );

    /* Join room */

    socket.on(
      'join_room',
      ({
        roomId,
        username
      }) => {

        if (
          !roomId ||
          !username
        ) return;

        userSocketMap[
          socket.id
        ] = username;

        socket.join(
          roomId
        );

        console.log(
          `✅ ${username} joined room ${roomId}`
        );

        console.log(
          'Room members:',
          io.sockets.adapter.rooms.get(
            roomId
          )
        );

        io.to(
          roomId
        ).emit(
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

    /* Realtime code */

    socket.on(
      'code_change',
      ({
        roomId,
        code
      }) => {

        socket
          .to(roomId)
          .emit(
            'code_update',
            code
          );

      }
    );

    /* Chat */

    socket.on(
      'send_message',
      ({
        roomId,
        message,
        username,
        time
      }) => {

        if (
          !roomId ||
          !message ||
          !username
        ) return;

        if (
          !message.trim()
        ) return;

        io.to(
          roomId
        ).emit(
          'receive_message',
          {
            message,
            username,
            time
          }
        );

      }
    );

    /* Disconnect */

    socket.on(
      'disconnect',
      reason => {

        console.log(
          `🔴 ${socket.id} disconnected`
        );

        console.log(
          `Reason: ${reason}`
        );

        for (
          const roomId of socket.rooms
        ) {

          if (
            roomId !== socket.id
          ) {

            socket
              .to(roomId)
              .emit(
                'disconnected',
                {
                  socketId:
                    socket.id,
                  username:
                    userSocketMap[
                      socket.id
                    ]
                }
              );

          }
        }

        delete userSocketMap[
          socket.id
        ];

      }
    );

  }
);

/* ============================
   Worker Result Listener
============================ */

sub.subscribe(
  'job_results'
);

sub.on(
  'message',
  (_, message) => {

    try {

      console.log(
        '📥 Worker Result:',
        message
      );

      const parsed =
        JSON.parse(
          message
        );

      const {
        roomId,
        output,
        status
      } = parsed;

      console.log(
        'Sending to room:',
        roomId
      );

      console.log(
        'Clients:',
        io.sockets.adapter.rooms.get(
          roomId
        )
      );

      io.to(
        roomId
      ).emit(
        'code_result',
        {
          output,
          status
        }
      );

      console.log(
        `📤 Sent result to room ${roomId}`
      );

    } catch(err){

      console.error(
        '❌ Result Parse Error:',
        err
      );

    }

  }
);

/* ============================
   Health
============================ */

app.get(
  '/health',
  (_,res)=>{

    res.send(
      'CollaborativeCoder API Running'
    );

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

      if(
        !sourceCode ||
        !language ||
        !roomId
      ){

        return res
          .status(400)
          .json({
            error:'Missing fields'
          });

      }

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
          success:true,
          jobId:job.jobId
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

app.use('/auth', authRoutes);

/* Existing room/save/user routes stay unchanged */

/* ============================
   Start Server
============================ */

const PORT =
  process.env.PORT || 5000;

server.listen(
  PORT,
  ()=>{

    console.log(
      `🚀 Server running on ${PORT}`
    );

  }
);
