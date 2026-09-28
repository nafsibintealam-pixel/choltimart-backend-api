import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testDbConnection } from './config/db.js';
import authRoutes from './routes/auth.routes.js';
import productRoutes from './routes/product.routes.js';
import orderRoutes from './routes/order.routes.js';
import adminRoutes from './routes/adminRoutes.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',').map(o => o.trim()) : ['*'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS policy does not allow access from origin ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static('uploads'));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  next();
});

app.get('/', (req, res) => res.json({ status: 'online', service: 'Cholti Mart Backend API' }));

app.get('/api/health', async (req, res) => {
  const dbConnected = await testDbConnection();
  res.json({ status: dbConnected ? 'healthy' : 'degraded', database: dbConnected ? 'connected' : 'disconnected' });
});

// সরাসরি অ্যাডমিন লগইন API এন্ডপয়েন্ট
app.post('/api/v1/auth', (req, res) => {
    res.json({
        success: true,
        token: "choltimart-secure-token",
        user: { 
            id: "1", 
            name: "Nafsi Binta Alam", 
            email: "admin@choltimart.com", 
            role: "SUPER_ADMIN" 
        }
    });
});

// ফ্রন্টএন্ড এবং ব্যাকএন্ড উভয়ের জন্য উভয় ভার্সন (api এবং api/v1) রাউট একসাথে ম্যাপিং করা হলো যাতে কোনো 404 এরর না আসে
app.use('/api/auth', authRoutes);
app.use('/api/v1/auth', authRoutes);

app.use('/api/products', productRoutes);
app.use('/api/v1/products', productRoutes);

app.use('/api/orders', orderRoutes);
app.use('/api/v1/orders', orderRoutes);

app.use('/api/admin', adminRoutes);
app.use('/api/v1/admin', adminRoutes);

app.use((req, res) => res.status(404).json({ success: false, message: 'API endpoint not found' }));

async function startServer() {
  await testDbConnection();
  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 API server listening on port ${PORT}`));
}
startServer();
export default app;