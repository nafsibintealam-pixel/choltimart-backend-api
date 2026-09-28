import pool from './src/config/db.js';

async function fixDb() {
  try {
    console.log("🔄 Updating products table structure...");
    
    // আগের অসম্পূর্ণ টেবিলটি মুছে ফেলা হচ্ছে
    await pool.query('DROP TABLE IF EXISTS products');
    
    // সঠিক কলাম দিয়ে নতুন টেবিল তৈরি করা হচ্ছে
    const createTableSql = `
      CREATE TABLE products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        sku VARCHAR(100) UNIQUE,
        description TEXT,
        short_description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        regular_price DECIMAL(10, 2),
        stock_quantity INT DEFAULT 0,
        stock_status VARCHAR(50) DEFAULT 'in_stock',
        category_id INT,
        brand_id INT,
        image_url VARCHAR(255),
        gallery JSON,
        unit VARCHAR(50),
        weight DECIMAL(10, 2),
        is_featured TINYINT(1) DEFAULT 0,
        is_trending TINYINT(1) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'published',
        rating DECIMAL(3, 2) DEFAULT 5.00,
        reviews_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `;
    
    await pool.query(createTableSql);
    console.log("✅ Products table fixed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error fixing table:", error);
    process.exit(1);
  }
}

fixDb();