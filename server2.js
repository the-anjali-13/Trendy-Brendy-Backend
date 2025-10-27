const express = require("express");
const sql = require("mssql");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// MSSQL connection config
const dbConfig = {
  user: "sa",
  password: "database123",
  server: "ANJALI", // e.g. localhost or IP
  database: "ClothingApp",
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
  port: 1433,
};

// Connect to DB once
sql
  .connect(dbConfig)
  .then(() => console.log("Connected to MS SQL Server"))
  .catch((err) => console.error("DB Connection Failed: ", err));

app.get("/users", async (req, res) => {
  try {
    const result = await sql.query`SELECT * FROM Users`;
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching data");
  }
});

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
    // await sql.query`INSERT INTO Users (Name, Email) VALUES (${name}, ${email})`;
    await sql.query`INSERT INTO Users (
        username, password, email, phone_number, address, city, state, country, postal_code, gender, date_of_birth)
        VALUES (
        ${username}, ${password}, ${email}, ${phone_number}, ${address}, ${city}, ${state},${country},${postal_code},${gender}, ${date_of_birth});`;
    res.status(201).send("User added successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error inserting data ,try unique email");
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  let user;

  try {
    const result = await sql.query`SELECT * FROM Users WHERE email=${email}`;
    user = result.recordset[0];
    if (!user) {
      return res.status(401).send("User Not Found");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Error finding user");
  }

  try {
    if (user.password === password) {
      const token = jwt.sign(
        { email: user.email, password: user.password },
        "TRENDSBRENDS",
        { expiresIn: "1h" }
      );
      res.status(200).send({ jwt: token });
    } else {
      return res.status(401).send("Invalid Password");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error sending jwttoken");
  }
});


function authenication(req, res, next) {
  try {

    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      return res.status(401).json({ error: "Authorization header missing" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Token missing" });
    }

    // console.log("JWT Token:", token);
    const decoded = jwt.verify(token, "TRENDSBRENDS");
    req.user = decoded;
    next();

  } catch (err) {
    res.status(400).json({ error: "Invalid request" });
  }
}


app.get("/getuserprofile", authenication, async (req, res) => {

  const email = req.user.email;  
//   console.log(email);

  const result = await sql.query`SELECT * FROM Users WHERE email=${email}`
  const user = result.recordset[0];
//   console.log(user);

   res.status(200).send({user});

});


app.get("/api/product/:proid",authenication, async (req, res) => {
  try {
    const proid = parseInt(req.params.proid);

    let result = await sql.query`SELECT * FROM Products WHERE id = ${proid}`;

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get("/api/products", async (req, res) => {
  try {
    const { category, sort, rating, same } = req.query;

    let query = "SELECT * FROM Products";
    let conditions = [];

    if (category) conditions.push(`category = @category`);
    if (rating) conditions.push(`rating = @rating`);

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    if (sort === "price_desc") query += " ORDER BY price DESC";
    else if (sort === "price_asc") query += " ORDER BY price ASC";
    else if (sort === "rating_desc") query += " ORDER BY rating DESC";

    if (same) query += " ORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT 5 ROWS ONLY"; // SQL Server version of LIMIT

    // console.log(query);
    let request = new sql.Request();

    if (category) request.input("category", sql.NVarChar, category);
    if (rating) request.input("rating", sql.Int, rating);

    // console.log(category,rating);

    let result = await request.query(query);
    // console.log(result);
    // console.log(result.recordset);
    res.json(result.recordset);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/wishlist/add/:proid",authenication,async (req, res)=>{

    const email = req.user.email;  
    const productid = parseInt(req.params.proid);

    try{

        const userresult = await sql.query`SELECT id FROM Users WHERE email=${email}`;
        if (userresult.recordset.length === 0) {
            return res.status(404).send("User not found");
        }
        const userid = userresult.recordset[0].id;

        const existing = await sql.query`SELECT id FROM WishlistItems WHERE user_id=${userid} AND product_id=${productid}`;

        if (existing.recordset.length > 0) {
          return res.status(409).json({ message: "Product already in wishlist" });
        }

        await sql.query`INSERT INTO WishlistItems (user_id , product_id) VALUES (${userid},${productid})`;
        res.status(201).json({ message: "Product added to Wishlist successfully" });

    }catch (err) {
        console.error(err);
        res.status(500).send("Error inserting item in wishlist");
   }

});

app.get("/wishlist/get",authenication, async (req,res)=>{

    const email = req.user.email; 

    try{

        const userresult = await sql.query`SELECT id FROM Users WHERE email=${email}`;
        if (userresult.recordset.length === 0) {
            return res.status(404).send("User not found");
        }
        const userid = userresult.recordset[0].id;

        const result = await sql.query`SELECT  w.id, p.id AS product_id, p.name, p.price, p.imgsrc, p.rating, p.description    
                                  FROM WishlistItems w
                                  JOIN Products p ON w.product_id = p.id  
                                  WHERE w.user_id = ${userid};`;

        const wishlist = result.recordset;
        res.status(200).send(wishlist);

    }catch (err) {
        console.error(err);
        res.status(500).send("Error inserting item in wishlist");
   }
});

app.delete("/wishlist/delete/:id", authenication, async (req, res) => {
  const email = req.user.email; 
  const wishlistItemId = parseInt(req.params.id);

    try {
    
      const userresult = await sql.query`SELECT id FROM Users WHERE email=${email}`;
      if (userresult.recordset.length === 0) {
        return res.status(404).send("User not found");
      }
      const userid = userresult.recordset[0].id;

      await sql.query`DELETE FROM WishlistItems WHERE id = ${wishlistItemId} AND user_id = ${userid};`;
      res.status(200).json({ message: "Wishlist item deleted successfully" });

    } catch (err) {
      console.error(err);
      res.status(500).send("Error deleting wishlist item");
    }
});


app.post("/cart/add/:proid",authenication,async (req, res)=>{

  const email = req.user.email;  
  const productid = parseInt(req.params.proid);
  const {quantity} = req.body;

    try{

      const userresult = await sql.query`SELECT id FROM Users WHERE email=${email}`;
      if (userresult.recordset.length === 0) {
          return res.status(404).send("User not found");
      }
      const userid = userresult.recordset[0].id;

      const existing = await sql.query`SELECT id , quantity FROM CartItems WHERE user_id=${userid} AND product_id=${productid}`;

      if (existing.recordset.length > 0) {

          const existingQuantity = existing.recordset[0].quantity;
          const newQuantity = existingQuantity + quantity;

          await sql.query`
            UPDATE CartItems 
            SET quantity=${newQuantity} 
            WHERE user_id=${userid} AND product_id=${productid}
          `;

          return res.status(200).json({ message: "Cart updated successfully" });
        
      }

      await sql.query`INSERT INTO CartItems (user_id , product_id, quantity) VALUES (${userid},${productid},${quantity})`;
      res.status(201).json({ message: "Product added to cart successfully" });

    }catch (err) {
        console.error(err);
        res.status(500).send("Error inserting item in cart");
   }

});


app.get("/cart/get",authenication, async (req,res)=>{

    const email = req.user.email; 

    try{

        const userresult = await sql.query`SELECT id FROM Users WHERE email=${email}`;
        if (userresult.recordset.length === 0) {
            return res.status(404).send("User not found");
        }
        const userid = userresult.recordset[0].id;

        const result = await sql.query`SELECT  c.id, c.quantity, p.id AS product_id, p.name, p.price, p.imgsrc, p.rating, p.description    
                                  FROM CartItems c
                                  JOIN Products p ON c.product_id = p.id  
                                  WHERE c.user_id = ${userid};`;

        const cartlist = result.recordset;
        res.status(200).send({cartlist, length:cartlist.length});

    }catch (err) {
        console.error(err);
        res.status(500).send("Error fetching cart items");
   }

});


app.delete("/cart/delete/:id", authenication, async (req, res) => {
  const email = req.user.email; 
  const cartitemId = parseInt(req.params.id);

    try {
    
      const userresult = await sql.query`SELECT id FROM Users WHERE email=${email}`;
      if (userresult.recordset.length === 0) {
        return res.status(404).send("User not found");
      }
      const userid = userresult.recordset[0].id;

      await sql.query`DELETE FROM CartItems WHERE id = ${cartitemId} AND user_id = ${userid};`;
      res.status(200).json({ message: "Cart item deleted successfully" });

    } catch (err) {
      console.error(err);
      res.status(500).send("Error deleting Cart item");
    }
});

app.get("/getcategory",authenication,async (req,res)=>{

    try{
      const result = await sql.query`SELECT * FROM Categories`;
      if (result.recordset.length === 0) {
        return res.status(404).send("category not found");
      }

      res.status(200).json(result.recordset);
    }
     catch (err) {
      console.error(err);
      res.status(500).send("Error fetching category");
    }
});

app.get("/products/category/:catname", async (req, res) => {
  try {
    const catname = req.params.catname;
    let result = await sql.query`
      SELECT * FROM Products WHERE category = ${catname}
    `;
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



const PORT = 3002;
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
