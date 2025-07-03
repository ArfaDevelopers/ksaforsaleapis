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

// Twilio Credentials (Ensure these are securely stored, not hardcoded)
// const TWILIO_SERVICE_SID = process.env.TWILIO_SERVICE_SID;
// const TWILIO_SERVICE_SID = "VA51beac2a0c74d6cb4c150799d00ee491";

// const TWILIO_ACCOUNT_SID = "AC10ecc49693f7d3f967529681877e661f";
// const TWILIO_AUTH_TOKEN = "b1b5ec56e8255b53aeb5d7a0e4c5ff8b";

// const TWILIO_SERVICE_SID = "VA11fde75371f7e79949bcf4c1e6cb8fef";

// const TWILIO_ACCOUNT_SID = "AC1889f1661cd9d55526ddbf75143ca9a2";
// const TWILIO_AUTH_TOKEN = "3646885bb5e2f2adb574680251d84de5";
// Generate Access Token for User
// const TWILIO_PHONE_NUMBER = "+12013895347"; // Your Twilio number
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
router.get("/fetchCars", async (req, res) => {
  try {
    const {
      searchQuery = "",
      id: userId = "",
      sortOrder = "Newest",
    } = req.query;

    // Return early if no userId provided
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "This user has no listings. No userId provided.",
        data: [],
      });
    }

    const collections = [
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

    const fetchCollections = collections.map(async (colName) => {
      const colRef = collection(db, colName);
      const snapshot = await getDocs(colRef);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    });

    const results = await Promise.all(fetchCollections);
    const combinedData = results.flat();

    const filteredByUser = combinedData.filter(
      (item) => item.userId === userId
    );

    // If userId is provided but there are no listings
    if (filteredByUser.length === 0) {
      return res.status(200).json({
        success: false,
        message: "This user has no listings.",
        data: [],
      });
    }

    const searchedData = searchQuery
      ? filteredByUser.filter(
          (item) =>
            (item.title?.toLowerCase() || "").includes(
              searchQuery.toLowerCase()
            ) ||
            (item.description?.toLowerCase() || "").includes(
              searchQuery.toLowerCase()
            )
        )
      : filteredByUser;

    const sortedData = searchedData.sort((a, b) => {
      const dateA = a.createdAt?.seconds || 0;
      const dateB = b.createdAt?.seconds || 0;
      return sortOrder === "Newest" ? dateB - dateA : dateA - dateB;
    });

    res.status(200).json({
      success: true,
      message: "Listings fetched successfully.",
      data: sortedData,
    });
  } catch (error) {
    console.error("Error fetching listings:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
});
module.exports = router;
