import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testDbConnection } from './config/db.js';
import authRoutes from './routes/auth.routes.js';
import productRoutes from './routes/product.routes.js';
import orderRoutes from './routes/order.routes.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// ------------------------------------------------------------------------------
// 1. CORS CONFIGURATION
// ------------------------------------------------------------------------------
const allowedOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map(o => o.trim())
  : ['*'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS policy does not allow access from origin ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// ------------------------------------------------------------------------------
// 2. PARSING & LOGGING MIDDLEWARE
// ------------------------------------------------------------------------------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  next();
});

// ------------------------------------------------------------------------------
// 3. HEALTH CHECK & API INFO
// ------------------------------------------------------------------------------
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Cholti Mart Backend API',
    version: '1.0.0',
    documentation: '/api/health'
  });
});

app.get('/api/health', async (req, res) => {
  const dbConnected = await testDbConnection();
  res.json({
    status: dbConnected ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    database: dbConnected ? 'connected' : 'disconnected',
    environment: process.env.NODE_ENV || 'production'
  });
});

// ------------------------------------------------------------------------------
// 4. API ROUTES
// ------------------------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

// ------------------------------------------------------------------------------
// 5. 404 & ERROR HANDLING
// ------------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`
  });
});

app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'An internal server error occurred.',
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
  });
});

// ------------------------------------------------------------------------------
// 6. SERVER INITIALIZATION
// ------------------------------------------------------------------------------
async function startServer() {
  await testDbConnection();

  app.listen(PORT, '0.0.0.0', () => {
    console.log('================================================================');
    console.log(`🚀 Cholti Mart API server listening on http://0.0.0.0:${PORT}`);
    console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
    console.log('================================================================');
  });
}

startServer();
export default app;