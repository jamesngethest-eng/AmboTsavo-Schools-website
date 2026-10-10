const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

const db = new sqlite3.Database('./school_v2.db', (err) => {
    if (err) console.error('Database connection error:', err.message);
    else console.log('Connected to SQLite database (school_v2.db).');
});

db.serialize(() => {
    // USERS: Students, Parents, Teachers
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT,             -- 'student', 'parent', 'teacher'
        name TEXT,
        childName TEXT,        -- Used for Parents
        grade TEXT,
        phone TEXT,
        password TEXT,
        status TEXT DEFAULT 'pending' -- 'approved' or 'pending'
    )`);

    // HOMEWORK
    db.run(`CREATE TABLE IF NOT EXISTS homework (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grade TEXT,
        subject TEXT,
        title TEXT,
        description TEXT,
        dueDate TEXT
    )`);

    // MARKS / EXAM RESULTS
    db.run(`CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        studentName TEXT,
        grade TEXT,
        subject TEXT,
        examType TEXT,
        score TEXT,
        gradeLetter TEXT
    )`);

    // SCHOOL FEES & ARREARS
    db.run(`CREATE TABLE IF NOT EXISTS fees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        studentName TEXT,
        grade TEXT,
        tuition TEXT,
        arrears TEXT,
        balance TEXT,
        status TEXT
    )`);

    // COMMUNITY FEED (Parents + Teachers only)
    db.run(`CREATE TABLE IF NOT EXISTS community (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        authorName TEXT,
        role TEXT,
        content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// --- AUTHENTICATION ENDPOINTS ---

// Register (Student, Parent, or Teacher) - Saved as PENDING for Admin Approval
app.post('/api/auth/register', (req, res) => {
    const { role, name, childName, grade, phone, password } = req.body;
    db.run(
        `INSERT INTO users (role, name, childName, grade, phone, password, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        [role, name, childName || '', grade, phone, password],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Account request submitted successfully. Awaiting Admin Approval.' });
        }
    );
});

// Login
app.post('/api/auth/login', (req, res) => {
    const { role, phone, password } = req.body;
    db.get(
        `SELECT * FROM users WHERE phone = ? AND password = ? AND role = ?`,
        [phone, password, role],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(401).json({ success: false, message: 'Invalid phone number or password credentials.' });
            if (row.status !== 'approved') {
                return res.json({ success: false, pending: true, message: 'Your registration request is currently pending Admin approval.' });
            }
            res.json({ success: true, user: row });
        }
    );
});

// --- ADMIN ENDPOINTS ---

app.get('/api/admin/all', (req, res) => {
    db.all(`SELECT * FROM users`, [], (err, users) => {
        db.all(`SELECT * FROM homework`, [], (err2, homework) => {
            db.all(`SELECT * FROM results`, [], (err3, results) => {
                db.all(`SELECT * FROM fees`, [], (err4, fees) => {
                    res.json({ users, homework, results, fees });
                });
            });
        });
    });
});

app.post('/api/admin/approve-user', (req, res) => {
    const { id } = req.body;
    db.run(`UPDATE users SET status = 'approved' WHERE id = ?`, [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/admin/delete-user', (req, res) => {
    const { id } = req.body;
    db.run(`DELETE FROM users WHERE id = ?`, [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/admin/update-user', (req, res) => {
    const { id, name, grade, phone, role } = req.body;
    db.run(
        `UPDATE users SET name = ?, grade = ?, phone = ?, role = ? WHERE id = ?`,
        [name, grade, phone, role, id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

// --- TEACHER & CLASSROOM ENDPOINTS ---

app.get('/api/teacher/students', (req, res) => {
    const { grade } = req.query;
    db.all(`SELECT * FROM users WHERE grade = ? AND role = 'student'`, [grade], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Homework CRUD
app.get('/api/homework', (req, res) => {
    const { grade } = req.query;
    let query = grade ? `SELECT * FROM homework WHERE grade = ?` : `SELECT * FROM homework`;
    let params = grade ? [grade] : [];
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/homework', (req, res) => {
    const { grade, subject, title, description, dueDate } = req.body;
    db.run(
        `INSERT INTO homework (grade, subject, title, description, dueDate) VALUES (?, ?, ?, ?, ?)`,
        [grade, subject, title, description, dueDate],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.delete('/api/homework/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM homework WHERE id = ?`, [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Marks / Results CRUD
app.get('/api/results', (req, res) => {
    const { studentName, grade } = req.query;
    let query = `SELECT * FROM results WHERE studentName = ? AND grade = ?`;
    db.all(query, [studentName, grade], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/results', (req, res) => {
    const { studentName, grade, subject, examType, score, gradeLetter } = req.body;
    db.run(
        `INSERT INTO results (studentName, grade, subject, examType, score, gradeLetter) VALUES (?, ?, ?, ?, ?, ?)`,
        [studentName, grade, subject, examType, score, gradeLetter],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

// Fees & Arrears
app.get('/api/fees', (req, res) => {
    const { studentName, grade } = req.query;
    db.get(`SELECT * FROM fees WHERE studentName = ? AND grade = ?`, [studentName, grade], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || { tuition: '45,000', arrears: '0.00', balance: '0.00', status: 'Cleared' });
    });
});

app.post('/api/fees', (req, res) => {
    const { studentName, grade, tuition, arrears, balance, status } = req.body;
    db.run(
        `INSERT OR REPLACE INTO fees (studentName, grade, tuition, arrears, balance, status) VALUES (?, ?, ?, ?, ?, ?)`,
        [studentName, grade, tuition, arrears, balance, status],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

// Community Posts (Parents & Teachers Only)
app.get('/api/community', (req, res) => {
    db.all(`SELECT * FROM community ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/community', (req, res) => {
    const { authorName, role, content } = req.body;
    if (role === 'student') {
        return res.status(403).json({ error: 'Students do not have permission to access or post to community.' });
    }
    db.run(
        `INSERT INTO community (authorName, role, content) VALUES (?, ?, ?)`,
        [authorName, role, content],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});