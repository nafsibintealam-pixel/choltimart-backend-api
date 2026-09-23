import bcrypt from 'bcryptjs';
import pool from './src/config/db.js';

const seedAdmin = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'superadmin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ admin_users টেবিল সফলভাবে তৈরি হয়েছে।');

    const [rows] = await pool.query('SELECT * FROM admin_users WHERE email = ?', ['admin@choltimart.com']);
    
    if (rows.length === 0) {
      const hashedPassword = await bcrypt.hash('123456', 10);
      await pool.query('INSERT INTO admin_users (email, password_hash, role) VALUES (?, ?, ?)', 
        ['admin@choltimart.com', hashedPassword, 'superadmin']);
      console.log('✅ ডিফল্ট অ্যাডমিন তৈরি সম্পন্ন!');
    } else {
      console.log('⚠️ অ্যাডমিন অ্যাকাউন্ট আগে থেকেই ডাটাবেসে আছে!');
    }
    process.exit();
  } catch (error) {
    console.error('❌ ডাটাবেস এরর:', error);
    process.exit(1);
  }
};
seedAdmin();