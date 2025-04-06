import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://tastyfork.web.app",
      "https://tastyfork.firebaseapp.com",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decode) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }

    req.user = decode;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.0goom.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const run = async () => {
  try {
    // await client.connect();
    console.log("TastyFork server connected to the database");

    const database = client.db("tastyForkDB");
    const foods_collection = database.collection("foods");
    const orders_collection = database.collection("orders");

    // auth related apis
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "10h",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // logout the user
    app.post("/logout", (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // foods related apis
    // get all foods or limited foods
    app.get("/foods", async (req, res) => {
      const search = req.query?.search;
      console.log(search);
      const limits = parseInt(req.query.limit);
      // console.log(limits);
      let query = {};
      if (search) {
        query = { food_name: { $regex: search, $options: "i" } };
      }
      const foods = await foods_collection
        .find(query)
        .sort({ purchaseCount: -1 })
        .limit(limits)
        .toArray();
      res.send(foods);
    });

    // get specific food by id
    app.get("/food/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await foods_collection.findOne(query);
      res.send(result);
    });

    // get my foods for specific and logged in user
    app.get("/my_foods", verifyToken, async (req, res) => {
      const email = req.query.email;
      if (req.user?.email !== req.query?.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { "buyer.email": email };
      const orders = await foods_collection.find(query).toArray();
      res.send(orders);
    });

    // add food in database
    app.post("/add_food", async (req, res) => {
      const foodData = req.body;
      const newFood = await foods_collection.insertOne(foodData);
      res.send(newFood);
    });

    // update single my food
    app.patch("/update_food/:id", async (req, res) => {
      const id = req.params.id;
      const foodData = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateFood = {
        $set: {
          food_name: foodData.food_name,
          image: foodData.image,
          category: foodData.category,
          food_quantity: foodData.food_quantity,
          price: foodData.price,
          country: foodData.country,
          description: foodData.description,
        },
      };
      const result = await foods_collection.updateOne(filter, updateFood);
      res.send(result);
    });

    //// orders related apis ////
    // add orders in database
    app.post("/orders", async (req, res) => {
      const order = req.body;
      console.log(order);
      const result = await orders_collection.insertOne(order);

      // increase purchase count
      const filter = { _id: new ObjectId(order.food_id) };
      const update = {
        $inc: {
          purchaseCount: 1,
        },
      };

      await foods_collection.updateOne(filter, update);

      res.send(result);
    });

    // get all orders only for logged in user
    app.get("/my_orders", verifyToken, async (req, res) => {
      const email = req.query.email;
      // console.log(email);
      if (req.user?.email !== req.query?.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { user_email: email };
      const orders = await orders_collection.find(query).toArray();
      res.send(orders);
    });

    // delete specific my orders by id
    app.delete("/my_orders/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await orders_collection.deleteOne(query);
      res.send(result);
    });
  } catch (error) {
    console.log(error);
  }
};

run();

app.get("/", (req, res) => {
  res.send("TastyFork server making a food");
});

app.listen(port);
