// Import necessary modules
const express = require('express');
const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// ======================
// CONFIG
// ======================
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/chatconnect';
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwt';
const PORT = process.env.PORT || 3001;

// ======================
// MIDDLEWARE
// ======================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ======================
// DB CONNECTION
// ======================
// NOTE: useNewUrlParser and useUnifiedTopology are deprecated and no longer needed.
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connect error', err));

// ======================
// SCHEMAS
// ======================
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  passwordHash: String,
}, { timestamps: true });

const messageSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  username: String,
  text: String,
  timestamp: { type: Date, default: Date.now },
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// ======================
// AUTH MIDDLEWARE
// ======================
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ======================
// ROUTES
// ======================
app.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const user = new User({ name, email, passwordHash });
    await user.save();

    const token = jwt.sign({ id: user._id, name: user.name, email: user.email }, JWT_SECRET);
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing fields' });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id, name: user.name, email: user.email }, JWT_SECRET);
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/messages', authMiddleware, async (req, res) => {
  try {
    const msgs = await Message.find().sort({ timestamp: 1 }).limit(500).lean();
    const formattedMsgs = msgs.map(m => ({...m, id: m._id }));
    res.json(formattedMsgs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ======================
// SOCKET.IO
// ======================
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
      return next(new Error("Authentication error: No token provided."));
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.user = payload;
    next();
  } catch (e) {
    return next(new Error("Authentication error: Invalid token."));
  }
});

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id, socket.user.name);

  socket.on('chatMessage', async (data) => {
    try {
      const { id: userId, name: username } = socket.user;
      const msg = new Message({ userId, username, text: data.text });
      await msg.save();
      const payload = { id: msg._id, userId, username, text: msg.text, timestamp: msg.timestamp };
      io.emit('chatMessage', payload);
    } catch (err) {
      console.error('chatMessage error', err);
    }
  });

  socket.on('deleteMessage', async (data) => {
    try {
      const { messageId } = data;
      const userId = socket.user.id;
      const message = await Message.findById(messageId);
      if (!message) return;
      if (message.userId.toString() !== userId) return;
      await Message.findByIdAndDelete(messageId);
      io.emit('messageDeleted', messageId);
    } catch (err) {
      console.error('deleteMessage error', err);
    }
  });

  // ** NEW: Handle typing events **
  socket.on('typing-started', () => {
    // Broadcast to everyone *except* the person who is typing
    socket.broadcast.emit('user-is-typing', { username: socket.user.name });
  });

  socket.on('typing-stopped', () => {
    // Broadcast to everyone *except* the person who stopped typing
    socket.broadcast.emit('user-stopped-typing');
  });

  socket.on('disconnect', () => {
    // Let others know the user has disconnected
    socket.broadcast.emit('user-stopped-typing');
    console.log('❌ Socket disconnected:', socket.id);
  });
});

// ======================
// SERVE FRONTEND & START SERVER
// ======================
// FIX: Use a regular expression `/.*/` to create a catch-all route. This is more
// compatible with newer versions of Express that have stricter path matching rules.
// This route must be the LAST route defined to avoid overriding API endpoints.
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

