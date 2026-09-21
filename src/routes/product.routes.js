import { Router } from 'express';
import pool from '../config/db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

/**
 * Helper: Generate clean URL slug
 */
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

// ------------------------------------------------------------------------------
// 1. PUBLIC: GET ALL PRODUCTS WITH FILTERS & PAGINATION
// GET /api/products
// ------------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const {
      category,
      brand,
      search,
      minPrice,
      maxPrice,
      inStockOnly,
      isFeatured,
      isTrending,
      sortBy = 'newest',
      page = 1,
      limit = 20
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const whereConditions = ['p.status = "published"'];
    const queryParams = [];

    if (category) {
      if (!isNaN(category)) {
        whereConditions.push('p.category_id = ?');
        queryParams.push(parseInt(category, 10));
      } else {
        whereConditions.push('c.slug = ?');
        queryParams.push(category);
      }
    }

    if (brand) {
      if (!isNaN(brand)) {
        whereConditions.push('p.brand_id = ?');
        queryParams.push(parseInt(brand, 10));
      } else {
        whereConditions.push('b.slug = ?');
        queryParams.push(brand);
      }
    }

    if (search && search.trim() !== '') {
      whereConditions.push('(p.name LIKE ? OR p.sku LIKE ? OR p.description LIKE ?)');
      const searchTerm = `%${search.trim()}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm);
    }

    if (minPrice !== undefined && !isNaN(minPrice)) {
      whereConditions.push('p.price >= ?');
      queryParams.push(parseFloat(minPrice));
    }
    if (maxPrice !== undefined && !isNaN(maxPrice)) {
      whereConditions.push('p.price <= ?');
      queryParams.push(parseFloat(maxPrice));
    }

    if (inStockOnly === 'true' || inStockOnly === true) {
      whereConditions.push('p.stock_quantity > 0 AND p.stock_status = "in_stock"');
    }

    if (isFeatured === 'true' || isFeatured === true) {
      whereConditions.push('p.is_featured = 1');
    }
    if (isTrending === 'true' || isTrending === true) {
      whereConditions.push('p.is_trending = 1');
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    let orderClause = 'ORDER BY p.id DESC';
    if (sortBy === 'price-asc') orderClause = 'ORDER BY p.price ASC';
    else if (sortBy === 'price-desc') orderClause = 'ORDER BY p.price DESC';
    else if (sortBy === 'rating') orderClause = 'ORDER BY p.rating DESC';
    else if (sortBy === 'newest') orderClause = 'ORDER BY p.created_at DESC';

    const countSql = `
      SELECT COUNT(*) as total 
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      ${whereClause}
    `;
    const [countResult] = await pool.query(countSql, queryParams);
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limitNum);

    const dataSql = `
      SELECT 
        p.id, p.name, p.slug, p.sku, p.price, p.regular_price,
        p.stock_quantity, p.stock_status, p.image_url, p.gallery,
        p.unit, p.weight, p.is_featured, p.is_trending, p.rating,
        p.reviews_count, p.status, p.category_id,
        c.name AS category_name, c.slug AS category_slug,
        p.brand_id, b.name AS brand_name, b.slug AS brand_slug,
        p.created_at
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      ${whereClause}
      ${orderClause}
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(dataSql, [...queryParams, limitNum, offset]);

    return res.json({
      success: true,
      items: rows,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasMore: pageNum < totalPages
    });
  } catch (error) {
    console.error('[Get Products] Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch products.' });
  }
});

// ------------------------------------------------------------------------------
// 2. PUBLIC: GET ALL CATEGORIES WITH PRODUCT COUNT
// GET /api/products/categories/all
// ------------------------------------------------------------------------------
router.get('/categories/all', async (req, res) => {
  try {
    const [categories] = await pool.query(`
      SELECT 
        c.id, c.name, c.slug, c.description, c.image_url, c.parent_id,
        COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id AND p.status = 'published'
      WHERE c.status = 'active'
      GROUP BY c.id
      ORDER BY c.display_order ASC, c.name ASC
    `);

    return res.json({ success: true, items: categories });
  } catch (error) {
    console.error('[Get Categories] Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch categories.' });
  }
});

// ------------------------------------------------------------------------------
// 3. PUBLIC: GET SINGLE PRODUCT BY ID OR SLUG
// GET /api/products/:idOrSlug
// ------------------------------------------------------------------------------
router.get('/:idOrSlug', async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    const isId = !isNaN(idOrSlug);

    const query = `
      SELECT 
        p.*,
        c.name AS category_name, c.slug AS category_slug,
        b.name AS brand_name, b.slug AS brand_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE ${isId ? 'p.id = ?' : 'p.slug = ?'}
      LIMIT 1
    `;

    const [rows] = await pool.query(query, [idOrSlug]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    return res.json({ success: true, product: rows[0] });
  } catch (error) {
    console.error('[Get Single Product] Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch product.' });
  }
});

// ------------------------------------------------------------------------------
// 4. ADMIN: CREATE PRODUCT
// POST /api/products
// ------------------------------------------------------------------------------
router.post('/', requireAdmin, async (req, res) => {
  try {
    const {
      name, slug, sku, description, short_description, price, regular_price,
      stock_quantity = 0, category_id, brand_id, image_url, gallery, unit = 'piece',
      weight, is_featured = 0, is_trending = 0, status = 'published'
    } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ success: false, message: 'Product name and price are required.' });
    }

    const generatedSlug = slug ? slugify(slug) : slugify(name) + '-' + Math.floor(1000 + Math.random() * 9000);
    const generatedSku = sku || 'CM-' + Math.floor(100000 + Math.random() * 900000);
    const stockStatus = parseInt(stock_quantity, 10) > 0 ? 'in_stock' : 'out_of_stock';

    const insertSql = `
      INSERT INTO products (
        name, slug, sku, description, short_description, price, regular_price, 
        stock_quantity, stock_status, category_id, brand_id, image_url, gallery, 
        unit, weight, is_featured, is_trending, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.query(insertSql, [
      name, generatedSlug, generatedSku, description || null, short_description || null,
      parseFloat(price), regular_price ? parseFloat(regular_price) : null,
      parseInt(stock_quantity, 10), stockStatus, category_id ? parseInt(category_id, 10) : null,
      brand_id ? parseInt(brand_id, 10) : null, image_url || null,
      gallery ? JSON.stringify(gallery) : null, unit, weight || null,
      is_featured ? 1 : 0, is_trending ? 1 : 0, status
    ]);

    return res.status(201).json({
      success: true, message: 'Product created successfully.',
      productId: result.insertId, slug: generatedSlug, sku: generatedSku
    });
  } catch (error) {
    console.error('[Admin Create Product] Error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'A product with this SKU or slug already exists.' });
    }
    return res.status(500).json({ success: false, message: 'Internal server error while creating product.' });
  }
});

// ------------------------------------------------------------------------------
// 5. ADMIN: UPDATE PRODUCT
// PUT /api/products/:id
// ------------------------------------------------------------------------------
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const allowedFields = [
      'name', 'slug', 'sku', 'description', 'short_description', 'price',
      'regular_price', 'stock_quantity', 'stock_status', 'category_id',
      'brand_id', 'image_url', 'unit', 'weight', 'is_featured', 'is_trending', 'status'
    ];

    const fieldsToUpdate = [];
    const values = [];

    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        fieldsToUpdate.push(`${key} = ?`);
        if (key === 'stock_quantity') {
          const qty = parseInt(updates[key], 10);
          values.push(qty);
          fieldsToUpdate.push('stock_status = ?');
          values.push(qty > 0 ? 'in_stock' : 'out_of_stock');
        } else {
          values.push(updates[key]);
        }
      }
    }

    if (fieldsToUpdate.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields provided to update.' });
    }

    values.push(id);
    const updateSql = `UPDATE products SET ${fieldsToUpdate.join(', ')} WHERE id = ?`;
    const [result] = await pool.query(updateSql, values);

    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Product not found.' });
    return res.json({ success: true, message: 'Product updated successfully.' });
  } catch (error) {
    console.error('[Admin Update Product] Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update product.' });
  }
});

// ------------------------------------------------------------------------------
// 6. ADMIN: DELETE PRODUCT
// DELETE /api/products/:id
// ------------------------------------------------------------------------------
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM products WHERE id = ?', [id]);

    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Product not found.' });
    return res.json({ success: true, message: 'Product deleted successfully.' });
  } catch (error) {
    console.error('[Admin Delete Product] Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete product.' });
  }
});

export default router;