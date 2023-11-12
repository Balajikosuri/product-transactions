const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const axios = require("axios");
const cors = require("cors");

const app = express();
const dbPath = path.join(__dirname, "productTransactions.db");

let db = null;
const port = process.env.PORT || 8080;
app.use(cors());

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(port, () =>
      console.log(`server is listening http://localhost:${port}`)
    );
  } catch (error) {
    console.log(`Db Error:${error.message}`);
  }
};
initializeDBAndServer();

async function fetchSeedData() {
  try {
    const response = await axios.get(
      "https://s3.amazonaws.com/roxiler.com/product_transaction.json"
    );
    return await response.data;
  } catch (error) {
    if (error) {
      console.log(`Error while seeding data from api: ${error}`);
    }
  }
}

// CREATE TABLE IF NOT EXISTS product_transactions (
//     id INTEGER PRIMARY KEY,
//     title TEXT,
//     price INTEGER,
//     description  TEXT,
//     category TEXT,
//     image TEXT,
//     sold BOOLEAN,
//     dateOfSale TEXT
//   )

app.get("/api/get-transactions-count", async (req, res) => {
  const colsCount = await db.get(
    `select count(*) as number_of_transactions from product_transactions`
  );
  res.send(colsCount);
});

async function initializeAndSeedDatabase() {
  try {
    const res = await fetch("http://localhost:8080/api/get-transactions-count");
    const jsonData = await res.json();

    const numberOfTransactions = jsonData.number_of_transactions;
    // console.log(jsonData);
    if (numberOfTransactions === 0) {
      const seedData = await fetchSeedData();

      for (const transaction of seedData) {
        await db.run(
          `INSERT INTO product_transactions (id,title,price,description,category,image,sold,dateOfSale) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            transaction.id,
            transaction.title,
            transaction.price,
            transaction.description,
            transaction.category,
            transaction.image,
            transaction.sold,
            transaction.dateOfSale,
          ],
          (error) =>
            error &&
            (console.log(`Error while inserting Data into Table: ${error}`),
            process.exit(1))
        );
      }
    }
  } catch (error) {
    console.log(`Error during database initialization: ${error}`);
  }
}

//TODO initialize - database;
app.get("/api/initialize-database", async (req, res) => {
  try {
    await initializeAndSeedDatabase();
    res.status(200).json({ message: "Database initialized successfully" });
  } catch (error) {
    console.error(`Error while initializing : ${error}`);
    res.status(500).json("Internal Server Error at initialize-database");
  }
});
// transactions
app.get("/api/transactions", async (req, res) => {
  const { search = "", page = 1, perPage = 10 } = req.query;

  try {
    let query = `SELECT * FROM product_transactions WHERE 
                 title LIKE '%${search}%' OR 
                 description LIKE '%${search}%' OR 
                 price LIKE '%${search}%' 
                 LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`;

    const transactions = await db.all(query);
    res.json(transactions);
  } catch (error) {
    console.error(`Error while fetching transactions: ${error}`);
    res.status(500).send("Internal Server Error at transactions");
  }
});
// statistics by selected month
app.get("/api/statistics/:month", async (req, res) => {
  const { month } = req.params;
  try {
    const totalSaleAmount = await db.get(
      `SELECT SUM(price) as totalSaleAmount FROM product_transactions WHERE  CAST(strftime('%m', dateOfSale) AS int)=${month}  AND sold = 1 ORDER BY id `
    );

    const totalSoldItems = await db.get(
      `SELECT COUNT(*) as totalSoldItems FROM product_transactions WHERE  CAST(strftime('%m', dateOfSale) AS int)=${month}  AND sold = 1 ORDER BY id `
    );

    const totalNotSoldItems = await db.get(
      `SELECT COUNT(*) as totalNotSoldItems FROM product_transactions WHERE  CAST(strftime('%m', dateOfSale) AS int)=${month}  AND sold = 0 ORDER BY id`
    );

    res.json({
      total_sale_amount: totalSaleAmount.totalSaleAmount || 0,
      total_sold_items: totalSoldItems.totalSoldItems || 0,
      total_not_sold_items: totalNotSoldItems.totalNotSoldItems || 0,
    });
  } catch (error) {
    console.error(`Error while fetching statistics: ${error}`);
    res.status(500).send("Internal Server Error at statistics");
  }
});
// bar-chart by selected month regardless of the year
app.get("/api/bar-chart/:month", async (req, res) => {
  const { month } = req.params;

  try {
    const priceRanges = [
      "0-100",
      "101-200",
      "201-300",
      "301-400",
      "401-500",
      "501-600",
      "601-700",
      "701-800",
      "801-900",
      "901-above",
    ];

    const barChartData = await db.all(`
      SELECT 
        CASE 
          WHEN price >= 0 AND price <= 100 THEN '0-100'
          WHEN price >= 101 AND price <= 200 THEN '101-200'
          WHEN price >= 201 AND price <= 300 THEN '201-300'
          WHEN price >= 301 AND price <= 400 THEN '301-400'
          WHEN price >= 401 AND price <= 500 THEN '401-500'
          WHEN price >= 501 AND price <= 600 THEN '501-600'
          WHEN price >= 601 AND price <= 700 THEN '601-700'
          WHEN price >= 701 AND price <= 800 THEN '701-800'
          WHEN price >= 801 AND price <= 900 THEN '801-900'
          WHEN price >= 901 THEN '901-above'
        END AS range,
        COUNT(*) AS items
      FROM product_transactions
      WHERE CAST(strftime('%m', dateOfSale) AS int) = ${month}
      GROUP BY range
    `);

    const result = priceRanges.map((range) => ({
      range,
      items: barChartData.find((item) => item.range === range)?.items || 0,
    }));

    res.json(result);
  } catch (error) {
    console.error(`Error while fetching bar chart data: ${error}`);
    res.status(500).send("Internal Server Error at bar-char");
  }
});

//pie-chart

app.get("/api/pie-chart/:month", async (req, res) => {
  const { month } = req.params;

  try {
    const selectedMonth = month;
    const categories = [
      "men's clothing",
      "jewelry",
      "electronics",
      "women's clothing",
    ];

    const pieChartData = await Promise.all(
      categories.map(async (category) => {
        const items = await db.get(
          `
          SELECT COUNT(*) AS items
          FROM product_transactions
          WHERE CAST(strftime('%m', dateOfSale) AS int) = ? AND category = ?
        `,
          [selectedMonth, category]
        );

        return { category, items: items.items || 0 };
      })
    );

    res.json(pieChartData);
  } catch (error) {
    console.error(`Error while fetching pie chart data: ${error}`);
    res.status(500).send("Internal Server Error pie-chart");
  }
});

//TODO combined-product-data by month
app.get(
  "/api/product-transactions-statistics-barChart-pieChart/:month/",
  async (req, res) => {
    const { month } = req.params;
    let { search = "", page = 1, perPage = 10 } = req.query;

    try {
      const transactionsResponse = await axios.get(
        `https://product-transactions-api.onrender.com/api/transactions?search=${search}&page=${page}&perPage=${perPage}`
      );
      const statisticsResponse = await axios.get(
        `https://product-transactions-api.onrender.com/api/statistics/${month}`
      );
      const barChartDataResponse = await axios.get(
        `https://product-transactions-api.onrender.com/api/bar-chart/${month}`
      );
      const pieChartDataResponse = await axios.get(
        `https://product-transactions-api.onrender.com/api/pie-chart/${month}`
      );

      const combinedData = {
        transactions: transactionsResponse.data,
        statistics: statisticsResponse.data,
        barChart: barChartDataResponse.data,
        pieChart: pieChartDataResponse.data,
      };

      res.json(combinedData);
    } catch (error) {
      console.error(
        `Error while fetching combined product data: ${error.message}`
      );
      res.status(500).send("Internal Server Error");
    }
  }
);

// CAST(strftime('%Y', dateOfSale) AS int) = ${year} and
// CAST(strftime('%Y', dateOfSale) AS int) = ${year} and
// CAST(strftime('%Y', dateOfSale) AS int) = ${year} and
