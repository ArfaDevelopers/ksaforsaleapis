const { db } = require("../firebase/config");
const express = require("express");
const router = express.Router();
const twilio = require("twilio");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid"); // For generating unique IDs
const { error } = require("console");
const cors = require("cors");

const axios = require("axios");
require("dotenv").config();
const app = express();
const http = require("http");

const server = http.createServer(app);

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_SERVICE_SID = process.env.TWILIO_SERVICE_SID;
const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

require("dotenv").config();

app.use(express.json()); // Add this line

// Set up CORS
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
  })
);

// Create a new Socket.IO server
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

router.post("/relatedcars", async (req, res) => {
  const { title } = req.body;

  if (!title || title.trim() === "") {
    return res.status(400).json({ error: "Title is required" });
  }

  try {
    const carsSnapshot = await db.collection("Cars").get();
    const titleLower = title.toLowerCase();

    // Get cars with similar titles (basic text match)
    const relatedCars = [];

    carsSnapshot.forEach((doc) => {
      const car = doc.data();
      const carTitle = car.title?.toLowerCase() || "";

      if (
        carTitle.includes(titleLower) ||
        titleLower.includes(carTitle) || // match both directions
        titleLower.split(" ").some((word) => carTitle.includes(word))
      ) {
        relatedCars.push({ id: doc.id, ...car });
      }
    });

    // Optional: remove the exact match
    const filtered = relatedCars.filter(
      (car) => car.title.toLowerCase() !== titleLower
    );

    // Limit the result count (optional)
    return res.status(200).json(filtered.slice(0, 6));
  } catch (err) {
    console.error("Error fetching related cars:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
