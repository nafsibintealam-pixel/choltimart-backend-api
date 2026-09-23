import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

export const adminLogin = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: 'ইমেইল এবং পাসওয়ার্ড প্রদান করুন!' });

  try {
    const [rows] = await pool.query('SELECT * FROM admin_users WHERE email = ?', [email]);
    if (rows.length === 0) return res.status(401).json({ success: false, message: 'ভুল ইমেইল বা পাসওয়ার্ড!' });

    const admin = rows[0];
    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) return res.status(401).json({ success: false, message: 'ভুল ইমেইল বা পাসওয়ার্ড!' });

    const token = jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, process.env.JWT_SECRET || 'choltimart_super_secret_key', { expiresIn: '1d' });

    res.status(200).json({ success: true, message: 'লগইন সফল হয়েছে!', token, admin: { id: admin.id, email: admin.email, role: admin.role } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'সার্ভার এরর! লগইন করা যাচ্ছে না।' });
  }
};