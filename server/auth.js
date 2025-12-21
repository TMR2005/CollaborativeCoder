// server/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./models/User');

const JWT_SECRET = "hacker-pls-dont-steal"; 

router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            username, 
            email, 
            password: hashedPassword 
        });

        res.json({ message: "User registered successfully" });
    } catch (error) {
        res.status(500).json({ error: "Registration failed (Email/User likely exists)" });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) return res.status(400).json({ error: "User not found" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

        const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });

        res.json({ token, username: user.username, userId: user._id });
    } catch (error) {
        res.status(500).json({ error: "Login failed" });
    }
});

module.exports = router;