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
  const { title, category } = req.body;

  if (!title || title.trim() === "") {
    return res.status(400).json({ error: "Title is required" });
  }

  // Category to Collection mapping
  const categoryMap = {
    Motors: "Cars",
    Electronics: "ELECTRONICS",
    "Fashion Style": "FASHION",
    "Home & Furnituer": "HEALTHCARE",
    "Job Board": "JOBBOARD",
    "Real Estate": "REALESTATECOMP",
    Services: "TRAVEL",
    "Sports & Game": "SPORTSGAMESComp",
    "Pet & Animals": "PETANIMALCOMP",
    Other: "Education",
  };

  const collectionName = categoryMap[category];

  if (!collectionName) {
    return res.status(400).json({ error: "Invalid category provided" });
  }

  try {
    const snapshot = await db.collection(collectionName).get();
    const titleLower = title.toLowerCase();

    const relatedItems = [];

    snapshot.forEach((doc) => {
      const item = doc.data();
      const itemTitle = item.title?.toLowerCase() || "";

      if (
        itemTitle.includes(titleLower) ||
        titleLower.includes(itemTitle) ||
        titleLower.split(" ").some((word) => itemTitle.includes(word))
      ) {
        relatedItems.push({ id: doc.id, ...item });
      }
    });

    const filtered = relatedItems.filter(
      (item) => item.title.toLowerCase() !== titleLower
    );

    return res.status(200).json(filtered.slice(0, 6));
  } catch (err) {
    console.error("Error fetching related items:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
