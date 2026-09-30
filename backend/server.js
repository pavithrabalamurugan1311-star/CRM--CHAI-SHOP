const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));   // serves frontend, css, js
app.get('/', (req, res) => res.redirect('/frontend/index.html'));

// Wrapper so any database error is sent back as JSON
const run = fn => (req, res) => fn(req, res).catch(e => {
  console.error(e);
  const msg = e.errno === 1451 ? 'Cannot delete: this record is used in other data.' : e.message;
  res.status(500).json({ error: msg });
});

// ---------- LOGIN ----------
app.post('/api/login', run(async (req, res) => {
  const { username, password, role } = req.body;
  const [rows] = await db.query(
    'SELECT id, name, role FROM users WHERE username=? AND password=? AND role=?',
    [username, password, role]);
  if (rows.length === 0) return res.status(401).json({ error: 'Wrong username, password or role' });
  res.json(rows[0]);
}));

// ---------- CUSTOMERS ----------
app.get('/api/customers', run(async (req, res) => {
  const s = '%' + (req.query.search || '') + '%';
  const [rows] = await db.query(
    `SELECT c.*, COALESCE(SUM(l.points),0) AS points
     FROM customers c LEFT JOIN loyalty_points l ON l.customer_id = c.id
     WHERE c.name LIKE ? OR c.phone LIKE ?
     GROUP BY c.id ORDER BY c.id DESC`, [s, s]);
  res.json(rows);
}));
app.post('/api/customers', run(async (req, res) => {
  const { name, phone, email, address } = req.body;
  await db.query('INSERT INTO customers (name, phone, email, address) VALUES (?,?,?,?)', [name, phone, email, address]);
  res.json({ ok: true });
}));
app.put('/api/customers/:id', run(async (req, res) => {
  const { name, phone, email, address } = req.body;
  await db.query('UPDATE customers SET name=?, phone=?, email=?, address=? WHERE id=?', [name, phone, email, address, req.params.id]);
  res.json({ ok: true });
}));
app.delete('/api/customers/:id', run(async (req, res) => {
  await db.query('DELETE FROM customers WHERE id=?', [req.params.id]);
  res.json({ ok: true });
}));

// ---------- PRODUCTS (INVENTORY) ----------
app.get('/api/products', run(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM products ORDER BY id DESC');
  res.json(rows);
}));
app.post('/api/products', run(async (req, res) => {
  const { name, price, quantity } = req.body;
  await db.query('INSERT INTO products (name, price, quantity) VALUES (?,?,?)', [name, price, quantity]);
  res.json({ ok: true });
}));
app.put('/api/products/:id', run(async (req, res) => {
  const { name, price, quantity } = req.body;
  await db.query('UPDATE products SET name=?, price=?, quantity=? WHERE id=?', [name, price, quantity, req.params.id]);
  res.json({ ok: true });
}));
app.delete('/api/products/:id', run(async (req, res) => {
  await db.query('DELETE FROM products WHERE id=?', [req.params.id]);
  res.json({ ok: true });
}));

// ---------- BRANCHES ----------
app.get('/api/branches', run(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM branches ORDER BY id');
  res.json(rows);
}));
app.post('/api/branches', run(async (req, res) => {
  const { name, address, phone } = req.body;
  await db.query('INSERT INTO branches (name, address, phone) VALUES (?,?,?)', [name, address, phone]);
  res.json({ ok: true });
}));

// ---------- SALES ----------
app.get('/api/sales', run(async (req, res) => {
  const [rows] = await db.query(
    `SELECT s.id, s.total, s.created_at, c.name AS customer, b.name AS branch
     FROM sales s JOIN customers c ON c.id = s.customer_id JOIN branches b ON b.id = s.branch_id
     ORDER BY s.id DESC`);
  res.json(rows);
}));

// Create a sale: save sale + items, reduce stock, add loyalty points (all in one transaction)
app.post('/api/sales', async (req, res) => {
  const { customer_id, branch_id, user_id, items } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'Add at least one item' });
  const con = await db.getConnection();
  try {
    await con.beginTransaction();
    const [sale] = await con.query('INSERT INTO sales (customer_id, branch_id, user_id, total) VALUES (?,?,?,0)',
      [customer_id, branch_id, user_id]);
    let total = 0;
    for (const it of items) {
      const [[p]] = await con.query('SELECT * FROM products WHERE id=?', [it.product_id]);
      if (!p || p.quantity < it.quantity) throw new Error('Not enough stock for ' + (p ? p.name : 'product'));
      total += p.price * it.quantity;
      await con.query('INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?,?,?,?)',
        [sale.insertId, p.id, it.quantity, p.price]);
      await con.query('UPDATE products SET quantity = quantity - ? WHERE id=?', [it.quantity, p.id]);  // update inventory
    }
    await con.query('UPDATE sales SET total=? WHERE id=?', [total, sale.insertId]);
    const points = Math.floor(total / 100);      // 1 point for every 100 spent
    if (points > 0) {
      await con.query("INSERT INTO loyalty_points (customer_id, sale_id, points, type) VALUES (?,?,?,'earned')",
        [customer_id, sale.insertId, points]);
    }
    await con.commit();
    res.json({ id: sale.insertId, total, points });
  } catch (e) {
    await con.rollback();
    res.status(400).json({ error: e.message });
  } finally {
    con.release();
  }
});

// ---------- LOYALTY ----------
// Reward: 100 points = 50 discount
app.post('/api/loyalty/redeem', run(async (req, res) => {
  const { customer_id } = req.body;
  const [[r]] = await db.query('SELECT COALESCE(SUM(points),0) AS pts FROM loyalty_points WHERE customer_id=?', [customer_id]);
  if (r.pts < 100) return res.status(400).json({ error: 'Need at least 100 points' });
  await db.query("INSERT INTO loyalty_points (customer_id, points, type) VALUES (?,-100,'redeemed')", [customer_id]);
  res.json({ ok: true });
}));

// ---------- DASHBOARD & REPORTS ----------
app.get('/api/dashboard', run(async (req, res) => {
  const [[c]] = await db.query('SELECT COUNT(*) AS n FROM customers');
  const [[p]] = await db.query('SELECT COUNT(*) AS n FROM products');
  const [[b]] = await db.query('SELECT COUNT(*) AS n FROM branches');
  const [[s]] = await db.query('SELECT COALESCE(SUM(total),0) AS n FROM sales');
  const [daily] = await db.query(
    `SELECT DATE(created_at) AS day, COUNT(*) AS orders, SUM(total) AS total
     FROM sales GROUP BY DATE(created_at) ORDER BY day DESC LIMIT 7`);
  res.json({ customers: c.n, products: p.n, branches: b.n, sales: s.n, daily });
}));

app.get('/api/reports', run(async (req, res) => {
  const [[c]] = await db.query('SELECT COUNT(*) AS n FROM customers');
  const [[s]] = await db.query('SELECT COALESCE(SUM(total),0) AS n FROM sales');
  const [branches] = await db.query(
    `SELECT b.name, COUNT(s.id) AS orders, COALESCE(SUM(s.total),0) AS total
     FROM branches b LEFT JOIN sales s ON s.branch_id = b.id GROUP BY b.id, b.name`);
  res.json({ customers: c.n, sales: s.n, branches });
}));

app.listen(3000, () => console.log('CRM running at http://localhost:3000'));
