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

router.get("/listings", async (req, res) => {
  try {
    const { userId, page = 1, sortOrder = "Newest" } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId in query params" });
    }

    const LIMIT = 10;
    const currentPage = parseInt(page, 10);
    const COLLECTIONS = [
      "SPORTSGAMESComp",
      "REALESTATECOMP",
      "Cars",
      "ELECTRONICS",
      "Education",
      "FASHION",
      "HEALTHCARE",
      "JOBBOARD",
      "MAGAZINESCOMP",
      "PETANIMALCOMP",
      "TRAVEL",
    ];

    const fetchPromises = COLLECTIONS.map(async (collectionName) => {
      const snapshot = await db
        .collection(collectionName)
        .where("userId", "==", userId)
        .get();

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        isActive: doc.data().isActive ?? false,
        _collection: collectionName,
      }));
    });

    const results = await Promise.all(fetchPromises);
    const allData = results.flat();

    // Sort
    allData.sort((a, b) => {
      const aTime = a.createdAt?._seconds || 0;
      const bTime = b.createdAt?._seconds || 0;
      return sortOrder === "Oldest" ? aTime - bTime : bTime - aTime;
    });

    const total = allData.length;
    const start = (currentPage - 1) * LIMIT;
    const paginatedData = allData.slice(start, start + LIMIT);

    return res.status(200).json({
      total,
      page: currentPage,
      limit: LIMIT,
      totalPages: Math.ceil(total / LIMIT),
      data: paginatedData,
    });
  } catch (error) {
    console.error("Error fetching listings:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
