import { Router } from 'express';
import pool from '../config/db.js';
import { verifyToken, requireAdmin, optionalAuth } from '../middleware/auth.js';

const router = Router();

/**
 * Helper: Generate unique order number
 */
function generateOrderNumber() {
  return `CM-${Math.floor(10000 + Math.random() * 90000)}`;
}

// ------------------------------------------------------------------------------
// 1. PLACE ORDER (Public / Customer Checkout with Atomic Transaction)
// POST /api/orders
// ------------------------------------------------------------------------------
router.post('/', optionalAuth, async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const {
      customerName, phone, email, district, area, address, notes,
      paymentMethod = 'Cash on Delivery', shippingFee = 60, discount = 0, couponCode, items
    } = req.body;

    if (!customerName || !phone || !district || !area || !address) {
      return res.status(400).json({ success: false, message: 'Customer name, phone, district, area, and delivery address are required.' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty. At least one order item is required.' });
    }

    await connection.beginTransaction();
    let calculatedSubtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const pId = item.productId || item.id;
      const qty = parseInt(item.quantity, 10) || 1;

      const [pRows] = await connection.query(
        'SELECT id, name, sku, price, stock_quantity, image_url FROM products WHERE id = ? FOR UPDATE', [pId]
      );

      if (pRows.length === 0) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: `Product with ID ${pId} was not found.` });
      }

      const product = pRows[0];
      if (product.stock_quantity < qty) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: `Insufficient stock for "${product.name}". Available: ${product.stock_quantity}, Requested: ${qty}` });
      }

      const unitPrice = parseFloat(product.price);
      const lineSubtotal = unitPrice * qty;
      calculatedSubtotal += lineSubtotal;

      validatedItems.push({
        productId: product.id, productName: product.name, sku: product.sku, price: unitPrice,
        quantity: qty, subtotal: lineSubtotal, imageUrl: item.image || product.image_url, variant: item.variant || null
      });

      const newStock = product.stock_quantity - qty;
      const newStockStatus = newStock > 0 ? 'in_stock' : 'out_of_stock';
      await connection.query('UPDATE products SET stock_quantity = ?, stock_status = ? WHERE id = ?', [newStock, newStockStatus, product.id]);
    }

    const shipping = parseFloat(shippingFee) || 0;
    const disc = parseFloat(discount) || 0;
    const finalTotal = Math.max(0, calculatedSubtotal + shipping - disc);
    const orderNumber = generateOrderNumber();
    const customerId = req.user?.id || null;

    const insertOrderSql = `
      INSERT INTO orders (
        order_number, customer_id, customer_name, phone, email, 
        district, area, address, customer_notes, subtotal, shipping_fee, 
        discount, coupon_code, total, payment_method, payment_status, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', 'Pending')
    `;

    const [orderResult] = await connection.query(insertOrderSql, [
      orderNumber, customerId, customerName, phone, email || null, district, area, address,
      notes || null, calculatedSubtotal, shipping, disc, couponCode || null, finalTotal, paymentMethod
    ]);

    const orderId = orderResult.insertId;

    const insertItemSql = `
      INSERT INTO order_items (
        order_id, product_id, product_name, sku, price, quantity, subtotal, image_url, variant
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const valItem of validatedItems) {
      await connection.query(insertItemSql, [
        orderId, valItem.productId, valItem.productName, valItem.sku, valItem.price,
        valItem.quantity, valItem.subtotal, valItem.imageUrl, valItem.variant
      ]);
    }

    if (customerId) {
      await connection.query('UPDATE customers SET orders_count = orders_count + 1, total_spent = total_spent + ? WHERE id = ?', [finalTotal, customerId]);
    }

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: 'Order placed successfully.',
      order: { id: orderId, orderNumber, customerName, phone, total: finalTotal, status: 'Pending', paymentMethod, itemsCount: validatedItems.length }
    });
  } catch (error) {
    await connection.rollback();
    console.error('[Place Order] Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to process order checkout. Please try again.' });
  } finally {
    connection.release();
  }
});

// ------------------------------------------------------------------------------
// 2. TRACK ORDER (Public)
// GET /api/orders/track/:orderNumber?phone=017...
// ------------------------------------------------------------------------------
router.get('/track/:orderNumber', async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const { phone } = req.query;

    let query = 'SELECT * FROM orders WHERE order_number = ?';
    const params = [orderNumber];

    if (phone) {
      query += ' AND phone LIKE ?';
      params.push(`%${phone.trim()}%`);
    }

    const [orders] = await pool.query(query, params);
    if (orders.length === 0) return res.status(404).json({ success: false, message: 'Order not found.' });

    const order = orders[0];
    const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);

    return res.json({ success: true, order: { ...order, items } });
  } catch (error) {
    console.error('[Track Order] Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to track order.' });
  }
});

// ------------------------------------------------------------------------------
// 3. CUSTOMER: MY ORDERS
// GET /api/orders/my-orders
// ------------------------------------------------------------------------------
router.get('/my-orders', verifyToken, async (req, res) => {
  try {
    const [orders] = await pool.query(
      `SELECT o.*, COUNT(i.id) as items_count 
       FROM orders o LEFT JOIN order_items i ON o.id = i.order_id 
       WHERE o.customer_id = ? GROUP BY o.id ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    return res.json({ success: true, items: orders });
  } catch (error) {
    console.error('[My Orders] Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch customer orders.' });
  }
});

// ------------------------------------------------------------------------------
// 4. ADMIN: GET ALL ORDERS WITH FILTERS & PAGINATION
// GET /api/orders/admin/all
// ------------------------------------------------------------------------------
router.get('/admin/all', requireAdmin, async (req, res) => {
  try {
    const { status, paymentStatus, search, page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const whereConditions = [];
    const queryParams = [];

    if (status) { whereConditions.push('status = ?'); queryParams.push(status); }
    if (paymentStatus) { whereConditions.push('payment_status = ?'); queryParams.push(paymentStatus); }
    if (search && search.trim() !== '') {
      whereConditions.push('(order_number LIKE ? OR customer_name LIKE ? OR phone LIKE ?)');
      const term = `%${search.trim()}%`;
      queryParams.push(term, term, term);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const countSql = `SELECT COUNT(*) as total FROM orders ${whereClause}`;
    const [countRes] = await pool.query(countSql, queryParams);
    const total = countRes[0].total;
    const totalPages = Math.ceil(total / limitNum);

    const dataSql = `
      SELECT o.*, COUNT(i.id) as items_count 
      FROM orders o LEFT JOIN order_items i ON o.id = i.order_id
      ${whereClause} GROUP BY o.id ORDER BY o.created_at DESC LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(dataSql, [...queryParams, limitNum, offset]);
    return res.json({ success: true, items: rows, total, page: pageNum, limit: limitNum, totalPages });
  } catch (error) {
    console.error('[Admin Orders] Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch admin orders.' });
  }
});

// ------------------------------------------------------------------------------
// 5. ADMIN: GET SINGLE ORDER DETAILS
// GET /api/orders/admin/:id
// ------------------------------------------------------------------------------
router.get('/admin/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [orders] = await pool.query('SELECT * FROM orders WHERE id = ? OR order_number = ?', [id, id]);
    if (orders.length === 0) return res.status(404).json({ success: false, message: 'Order not found.' });

    const order = orders[0];
    const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    return res.json({ success: true, order: { ...order, items } });
  } catch (error) {
    console.error('[Admin Get Order Detail] Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch order details.' });
  }
});

// ------------------------------------------------------------------------------
// 6. ADMIN: UPDATE ORDER STATUS & DETAILS
// PUT /api/orders/admin/:id/status
// ------------------------------------------------------------------------------
router.put('/admin/:id/status', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, payment_status, courier_partner, tracking_number, admin_note } = req.body;

    const updates = [];
    const values = [];

    if (status) { updates.push('status = ?'); values.push(status); }
    if (payment_status) { updates.push('payment_status = ?'); values.push(payment_status); }
    if (courier_partner !== undefined) { updates.push('courier_partner = ?'); values.push(courier_partner); }
    if (tracking_number !== undefined) { updates.push('tracking_number = ?'); values.push(tracking_number); }
    if (admin_note !== undefined) { updates.push('admin_note = ?'); values.push(admin_note); }

    if (updates.length === 0) return res.status(400).json({ success: false, message: 'No updates provided.' });

    values.push(id);
    const sql = `UPDATE orders SET ${updates.join(', ')} WHERE id = ? OR order_number = ?`;
    values.push(id);

    const [result] = await pool.query(sql, values);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Order not found.' });

    return res.json({ success: true, message: 'Order status updated successfully.' });
  } catch (error) {
    console.error('[Admin Update Order Status] Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update order status.' });
  }
});

export default router;