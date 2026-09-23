import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false } 
});

// এই ফাংশনটি server.js খুঁজছিল
export const testDbConnection = async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ ডাটাবেসের সাথে সফলভাবে কানেক্ট হয়েছে (Aiven Cloud)!');
        connection.release();
    } catch (error) {
        console.error('❌ ডাটাবেস কানেকশন এরর:', error.message);
    }
};

export default pool;