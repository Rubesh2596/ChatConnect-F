// Import necessary modules
const express = require('express');
const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { Server } = require('socket.io');
const nodemailer = require('nodemailer'); // NEW: Import Nodemailer
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

// NEW: Nodemailer Configuration
// ======================
const transporter = nodemailer.createTransport({
  service: 'gmail', // You can use other services like Outlook, etc.
  auth: {
    user: process.env.EMAIL_USER || 'YOUR_EMAIL@gmail.com', // TODO: Replace with your email address
    pass: process.env.EMAIL_PASS || 'YOUR_GMAIL_APP_PASSWORD' // TODO: Replace with your Gmail App Password
  }
});


// ======================
// MIDDLEWARE
// ======================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ======================
// DB CONNECTION
// ======================
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
  isVerified: { type: Boolean, default: false },
  verificationCode: String,
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

    const existingUser = await User.findOne({ email });
    if (existingUser && existingUser.isVerified) {
        return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const verificationCode = Math.floor(1000 + Math.random() * 9000).toString();
    
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    if (existingUser && !existingUser.isVerified) {
        existingUser.name = name;
        existingUser.passwordHash = passwordHash;
        existingUser.verificationCode = verificationCode;
        await existingUser.save();
    } else {
        const user = new User({ name, email, passwordHash, verificationCode });
        await user.save();
    }
    
    // NEW: Send the verification email
    await transporter.sendMail({
        from: '"ChatConnect" <no-reply@chatconnect.app>',
        to: email,
        subject: "Your ChatConnect Verification Code",
        html: `
            <div style="font-family: sans-serif; text-align: center; padding: 20px;">
                <h2>Welcome to ChatConnect!</h2>
                <p>Your verification code is:</p>
                <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px; background: #eee; padding: 10px; border-radius: 5px;">${verificationCode}</p>
            </div>
        `
    });

    res.json({ message: 'Verification code has been sent to your email.' });
  } catch (err) {
    console.error('Signup Error:', err);
    res.status(500).json({ error: 'Could not send verification email. Please try again later.' });
  }
});

app.post('/verify', async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) return res.status(400).json({ error: 'Missing fields' });

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: 'User not found.' });
        if (user.isVerified) return res.status(400).json({ error: 'User already verified.' });

        if (user.verificationCode !== code) {
            return res.status(400).json({ error: 'Invalid verification code.' });
        }

        user.isVerified = true;
        user.verificationCode = undefined;
        await user.save();

        res.json({ message: 'Email verified successfully!' });
    } catch(err) {
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

    if (!user.isVerified) {
        return res.status(403).json({ error: 'Please verify your email before logging in.' });
    }

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

  socket.on('typing-started', () => {
    socket.broadcast.emit('user-is-typing', { username: socket.user.name });
  });

  socket.on('typing-stopped', () => {
    socket.broadcast.emit('user-stopped-typing');
  });

  socket.on('disconnect', () => {
    socket.broadcast.emit('user-stopped-typing');
    console.log('❌ Socket disconnected:', socket.id);
  });
});

// ======================
// SERVE FRONTEND & START SERVER
// ======================
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

