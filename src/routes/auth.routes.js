import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'default_choltimart_fallback_secret_change_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Helper: Generate signed JWT token
 */
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// ------------------------------------------------------------------------------
// 1. CUSTOMER REGISTRATION
// POST /api/auth/register
// ------------------------------------------------------------------------------
router.post('/register', async (req, res) => {
  try {
    const { name, phone, email, password, district, area, address } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, phone number, and password are required.'
      });
    }

    // Check if phone or email is already registered
    const [existing] = await pool.query(
      'SELECT id FROM customers WHERE phone = ? OR (email IS NOT NULL AND email = ?)',
      [phone, email || null]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A customer with this phone number or email already exists.'
      });
    }

    // Hash password securely with bcrypt
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert customer record into MySQL
    const [result] = await pool.query(
      `INSERT INTO customers (name, phone, email, password_hash, district, area, address) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, phone, email || null, passwordHash, district || null, area || null, address || null]
    );

    const customerId = result.insertId;
    const token = generateToken({
      id: customerId,
      name,
      phone,
      email: email || null,
      type: 'customer'
    });

    return res.status(201).json({
      success: true,
      message: 'Account registered successfully.',
      token,
      user: {
        id: customerId,
        name,
        phone,
        email: email || null,
        district: district || null,
        area: area || null,
        address: address || null,
        type: 'customer'
      }
    });
  } catch (error) {
    console.error('[Auth Register] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during registration.'
    });
  }
});

// ------------------------------------------------------------------------------
// 2. CUSTOMER LOGIN
// POST /api/auth/login
// ------------------------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const { identifier, phone, email, password } = req.body;
    const loginIdentifier = identifier || phone || email;

    if (!loginIdentifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Phone/Email and password are required.'
      });
    }

    // Find customer by phone or email
    const [rows] = await pool.query(
      'SELECT * FROM customers WHERE phone = ? OR email = ? LIMIT 1',
      [loginIdentifier, loginIdentifier]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Customer not found.'
      });
    }

    const customer = rows[0];

    // Check account status
    if (customer.status === 'blocked') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended. Please contact customer support.'
      });
    }

    if (!customer.password_hash) {
      return res.status(401).json({
        success: false,
        message: 'No password set for this account (guest profile). Please register or reset password.'
      });
    }

    // Compare bcrypt hash
    const isMatch = await bcrypt.compare(password, customer.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid phone or password.'
      });
    }

    // Issue JWT token
    const token = generateToken({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      type: 'customer'
    });

    return res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        district: customer.district,
        area: customer.area,
        address: customer.address,
        ordersCount: customer.orders_count,
        totalSpent: customer.total_spent,
        type: 'customer'
      }
    });
  } catch (error) {
    console.error('[Auth Login] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during login.'
    });
  }
});

// ------------------------------------------------------------------------------
// 3. ADMIN STAFF LOGIN
// POST /api/auth/admin/login
// ------------------------------------------------------------------------------
router.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required.'
      });
    }

    // Check active staff in admin_users table
    const [rows] = await pool.query(
      'SELECT * FROM admin_users WHERE (username = ? OR email = ?) AND status = "active" LIMIT 1',
      [username, username]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid administrative credentials.'
      });
    }

    const admin = rows[0];
    const isMatch = await bcrypt.compare(password, admin.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid administrative credentials.'
      });
    }

    // Issue admin token with role
    const token = generateToken({
      id: admin.id,
      username: admin.username,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      type: 'admin'
    });

    return res.json({
      success: true,
      message: 'Admin authentication successful.',
      token,
      admin: {
        id: admin.id,
        name: admin.name,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        type: 'admin'
      }
    });
  } catch (error) {
    console.error('[Admin Login] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during admin authentication.'
    });
  }
});

// ------------------------------------------------------------------------------
// 4. GET CURRENT AUTHENTICATED USER / ADMIN PROFILE
// GET /api/auth/me (Requires Authorization: Bearer <token>)
// ------------------------------------------------------------------------------
router.get('/me', verifyToken, async (req, res) => {
  try {
    // If authenticated user is an administrator
    if (req.user.type === 'admin') {
      const [admins] = await pool.query(
        'SELECT id, name, username, email, role, status FROM admin_users WHERE id = ?',
        [req.user.id]
      );
      if (admins.length === 0) {
        return res.status(404).json({ success: false, message: 'Admin profile not found.' });
      }
      return res.json({ success: true, user: { ...admins[0], type: 'admin' } });
    }

    // If authenticated user is a customer
    const [customers] = await pool.query(
      'SELECT id, name, phone, email, district, area, address, orders_count, total_spent, created_at FROM customers WHERE id = ?',
      [req.user.id]
    );

    if (customers.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer profile not found.' });
    }

    return res.json({ success: true, user: { ...customers[0], type: 'customer' } });
  } catch (error) {
    console.error('[Auth Me] Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch user profile.' });
  }
});

export default router;