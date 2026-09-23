import bcrypt from 'bcryptjs';
import pool from './src/config/db.js';

const seedAdmin = async () => {
  try {
    // ১. অ্যাডমিন ইউজার টেবিল (admin_users)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'superadmin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ২. ওয়েবসাইট সেটিংস টেবিল (site_settings)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) NOT NULL UNIQUE,
        setting_value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // ৩. ডায়নামিক পেজ ও পলিসি টেবিল (dynamic_pages)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dynamic_pages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        page_slug VARCHAR(100) NOT NULL UNIQUE,
        content_en LONGTEXT,
        content_bn LONGTEXT,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // ৪. প্রোডাক্ট ম্যানেজমেন্ট টেবিল (products)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        stock_quantity INT NOT NULL DEFAULT 0,
        image_url VARCHAR(255),
        status VARCHAR(50) DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ৫. অর্ডার ট্র্যাকিং টেবিল (orders)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_number VARCHAR(50) NOT NULL UNIQUE,
        customer_name VARCHAR(100) NOT NULL,
        customer_phone VARCHAR(20) NOT NULL,
        shipping_address TEXT NOT NULL,
        total_amount DECIMAL(10, 2) NOT NULL,
        order_status VARCHAR(50) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ ডাটাবেসের ৫টি কোর টেবিল সফলভাবে তৈরি হয়েছে।');

    // ৬. ডিফল্ট অ্যাডমিন ইনসার্ট করা
    const [rows] = await pool.query('SELECT * FROM admin_users WHERE email = ?', ['admin@choltimart.com']);
    
    if (rows.length === 0) {
      const hashedPassword = await bcrypt.hash('123456', 10);
      await pool.query('INSERT INTO admin_users (email, password_hash, role) VALUES (?, ?, ?)', 
        ['admin@choltimart.com', hashedPassword, 'superadmin']);
      console.log('✅ ডিফল্ট অ্যাডমিন তৈরি সম্পন্ন!');
      console.log('👉 লগইন ইমেইল: admin@choltimart.com');
      console.log('👉 পাসওয়ার্ড: 123456');
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