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
app.get("/bookmarked-listings", async (req, res) => {
  try {
    const { userId, sortOrder = "Newest", page = 1, limit = 10 } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId in query params" });
    }

    const currentPage = parseInt(page, 10);
    const pageSize = parseInt(limit, 10);

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
        .where("bookmarked", "==", true)
        .get();

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        category: collectionName,
        isActive: doc.data().isActive ?? false,
        createdAt: doc.data().createdAt || { seconds: 0 },
        _collection: collectionName,
      }));
    });

    const results = await Promise.all(fetchPromises);
    const allData = results.flat();

    // ✅ Filter out items where isActive is false
    const activeData = allData.filter((item) => item.isActive === false);

    // Sort
    activeData.sort((a, b) => {
      const aTime = a.createdAt?.seconds || a.createdAt?._seconds || 0;
      const bTime = b.createdAt?.seconds || b.createdAt?._seconds || 0;
      return sortOrder === "Oldest" ? aTime - bTime : bTime - aTime;
    });

    // Paginate
    const total = activeData.length;
    const start = (currentPage - 1) * pageSize;
    const paginatedData = activeData.slice(start, start + pageSize);

    return res.status(200).json({
      total,
      page: currentPage,
      limit: pageSize,
      totalPages: Math.ceil(total / pageSize),
      data: paginatedData,
    });
  } catch (error) {
    console.error("Error fetching bookmarked listings:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
