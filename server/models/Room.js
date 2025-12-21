const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  code: { type: String, default: "" }, 
  language: { type: String, default: "python" } 
});

module.exports = mongoose.model('Room', RoomSchema);