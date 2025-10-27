require('dotenv').config();
const mysql = require('mysql2/promise');
const express = require('express');
const cors = require('cors');
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Create MySQL connection
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// ✅ Connect and check
(async () => {
  try {
    const connection = await db.getConnection();
    console.log('✅ Connected to MySQL (clothingapp)');
    connection.release(); // return it to the pool
  } catch (err) {
    console.error('❌ Database connection failed:', err);
  }
})();

// Example test route
app.get('/', (req, res) => {
  res.send('Backend is running and connected to MySQL!');
});



// ------------------------- USERS APIs -------------------------

// GET all users
app.get("/users", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM Users");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching data");
  }
});

// SIGNUP
app.post("/signup", async (req, res) => {
  const {
    username,
    password,
    email,
    phone_number,
    address,
    city,
    state,
    country,
    postal_code,
    gender,
    date_of_birth,
  } = req.body;

  try {
    await db.query(
      `INSERT INTO Users 
      (username, password, email, phone_number, address, city, state, country, postal_code, gender, date_of_birth)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        username,
        password,
        email,
        phone_number,
        address,
        city,
        state,
        country,
        postal_code,
        gender,
        date_of_birth,
      ]
    );
    res.status(201).send("User added successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error inserting data, try unique email");
  }
});

// LOGIN
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await db.query("SELECT * FROM Users WHERE email = ?", [email]);
    const user = rows[0];

    if (!user) return res.status(401).send("User Not Found");

    if (user.password === password) {
      const token = jwt.sign(
        { email: user.email, password: user.password },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );
      return res.status(200).send({ jwt: token });
    } else {
      return res.status(401).send("Invalid Password");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error during login");
  }
});

// ------------------------- AUTH MIDDLEWARE -------------------------

function authentication(req, res, next) {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader) return res.status(401).json({ error: "Authorization header missing" });

    const token = authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Token missing" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(400).json({ error: "Invalid request" });
  }
}

// ------------------------- PROFILE -------------------------

app.get("/getuserprofile", authentication, async (req, res) => {
  const email = req.user.email;

  try {
    const [rows] = await db.query("SELECT * FROM Users WHERE email = ?", [email]);
    const user = rows[0];
    res.status(200).send({ user });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching user profile");
  }
});

// ------------------------- PRODUCTS -------------------------

// GET single product
app.get("/api/product/:proid", authentication, async (req, res) => {
  try {
    const proid = parseInt(req.params.proid);
    const [rows] = await db.query("SELECT * FROM Products WHERE id = ?", [proid]);

    if (rows.length === 0) return res.status(404).json({ error: "Product not found" });

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET all products with filters
app.get("/api/products", async (req, res) => {
  try {
    const { category, sort, rating, same } = req.query;
    let query = "SELECT * FROM Products";
    const params = [];

    const conditions = [];
    if (category) {
      conditions.push("category = ?");
      params.push(category);
    }
    if (rating) {
      conditions.push("rating = ?");
      params.push(Number(rating));
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    if (sort === "price_desc") query += " ORDER BY price DESC";
    else if (sort === "price_asc") query += " ORDER BY price ASC";
    else if (sort === "rating_desc") query += " ORDER BY rating DESC";

    if (same) query += " LIMIT 5"; // MySQL uses LIMIT

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------- WISHLIST -------------------------

app.post("/wishlist/add/:proid", authentication, async (req, res) => {
  const email = req.user.email;
  const productid = parseInt(req.params.proid);

  try {
    const [userRows] = await db.query("SELECT id FROM Users WHERE email = ?", [email]);
    if (userRows.length === 0) return res.status(404).send("User not found");
    const userid = userRows[0].id;

    const [existing] = await db.query(
      "SELECT id FROM WishlistItems WHERE user_id = ? AND product_id = ?",
      [userid, productid]
    );

    if (existing.length > 0) {
      return res.status(409).json({ message: "Product already in wishlist" });
    }

    await db.query("INSERT INTO WishlistItems (user_id, product_id) VALUES (?, ?)", [
      userid,
      productid,
    ]);

    res.status(201).json({ message: "Product added to Wishlist successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error inserting item in wishlist");
  }
});

app.get("/wishlist/get", authentication, async (req, res) => {
  const email = req.user.email;

  try {
    const [userRows] = await db.query("SELECT id FROM Users WHERE email = ?", [email]);
    if (userRows.length === 0) return res.status(404).send("User not found");
    const userid = userRows[0].id;

    const [rows] = await db.query(
      `SELECT w.id, p.id AS product_id, p.name, p.price, p.imgsrc, p.rating, p.description 
       FROM WishlistItems w
       JOIN Products p ON w.product_id = p.id 
       WHERE w.user_id = ?`,
      [userid]
    );

    res.status(200).json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching wishlist items");
  }
});

app.delete("/wishlist/delete/:id", authentication, async (req, res) => {
  const email = req.user.email;
  const wishlistItemId = parseInt(req.params.id);

  try {
    const [userRows] = await db.query("SELECT id FROM Users WHERE email = ?", [email]);
    if (userRows.length === 0) return res.status(404).send("User not found");
    const userid = userRows[0].id;

    await db.query("DELETE FROM WishlistItems WHERE id = ? AND user_id = ?", [
      wishlistItemId,
      userid,
    ]);

    res.status(200).json({ message: "Wishlist item deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting wishlist item");
  }
});

// ------------------------- CART -------------------------

app.post("/cart/add/:proid", authentication, async (req, res) => {
  const email = req.user.email;
  const productid = parseInt(req.params.proid);
  const { quantity } = req.body;

  try {
    const [userRows] = await db.query("SELECT id FROM Users WHERE email = ?", [email]);
    if (userRows.length === 0) return res.status(404).send("User not found");
    const userid = userRows[0].id;

    const [existing] = await db.query(
      "SELECT id, quantity FROM CartItems WHERE user_id = ? AND product_id = ?",
      [userid, productid]
    );

    if (existing.length > 0) {
      const existingQuantity = existing[0].quantity;
      const newQuantity = existingQuantity + quantity;

      await db.query(
        "UPDATE CartItems SET quantity = ? WHERE user_id = ? AND product_id = ?",
        [newQuantity, userid, productid]
      );

      return res.status(200).json({ message: "Cart updated successfully" });
    }

    await db.query(
      "INSERT INTO CartItems (user_id, product_id, quantity) VALUES (?, ?, ?)",
      [userid, productid, quantity]
    );
    res.status(201).json({ message: "Product added to cart successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error inserting item in cart");
  }
});

app.get("/cart/get", authentication, async (req, res) => {
  const email = req.user.email;

  try {
    const [userRows] = await db.query("SELECT id FROM Users WHERE email = ?", [email]);
    if (userRows.length === 0) return res.status(404).send("User not found");
    const userid = userRows[0].id;

    const [rows] = await db.query(
      `SELECT c.id, c.quantity, p.id AS product_id, p.name, p.price, p.imgsrc, p.rating, p.description
       FROM CartItems c
       JOIN Products p ON c.product_id = p.id
       WHERE c.user_id = ?`,
      [userid]
    );

    res.status(200).send({ cartlist: rows, length: rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching cart items");
  }
});

app.delete("/cart/delete/:id", authentication, async (req, res) => {
  const email = req.user.email;
  const cartitemId = parseInt(req.params.id);

  try {
    const [userRows] = await db.query("SELECT id FROM Users WHERE email = ?", [email]);
    if (userRows.length === 0) return res.status(404).send("User not found");
    const userid = userRows[0].id;

    await db.query("DELETE FROM CartItems WHERE id = ? AND user_id = ?", [cartitemId, userid]);

    res.status(200).json({ message: "Cart item deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting Cart item");
  }
});

// ------------------------- CATEGORIES -------------------------

app.get("/getcategory", authentication, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM Categories");
    if (rows.length === 0) return res.status(404).send("Category not found");

    res.status(200).json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching category");
  }
});

app.get("/products/category/:catname", async (req, res) => {
  try {
    const catname = req.params.catname;
    const [rows] = await db.query("SELECT * FROM Products WHERE category = ?", [catname]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});



const port = process.env.PORT;
app.listen(port, () => console.log(`Server running on port ${port}`));