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

router.post("/FASHION", async (req, res) => {
  try {
    const {
      searchText,
      regionId,
      CITY_ID,
      DISTRICT_ID,
      FeaturedAds,
      isActive,
      AdType,
      createdDate,
      ...otherFilters
    } = req.body;

    const snapshot = await db.collection("FASHION").get();
    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const data = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const docData = doc.data();
        const createdAt = docData.createdAt?.toDate?.() || null;

        if (
          docData.FeaturedAds === "Featured Ads" &&
          createdAt &&
          now - createdAt.getTime() > ONE_WEEK_MS
        ) {
          await db.collection("FASHION").doc(doc.id).update({
            FeaturedAds: "Not Featured Ads",
            featuredAt: null,
          });

          docData.FeaturedAds = "Not Featured Ads";
          docData.featuredAt = null;
        }

        return {
          id: doc.id,
          ...docData,
        };
      })
    );

    let filtered = data;

    // ✅ searchText: match in title or subCategories
    if (searchText) {
      const lowerText = searchText.toLowerCase();
      filtered = filtered.filter((item) => {
        const titleMatch = item.title?.toLowerCase().includes(lowerText);
        const subCategoriesMatch = Array.isArray(item.subCategories)
          ? item.subCategories.some((cat) =>
              cat.toLowerCase().includes(lowerText)
            )
          : false;
        return titleMatch || subCategoriesMatch;
      });
    }

    // ✅ Basic Filters
    if (regionId) {
      filtered = filtered.filter(
        (item) => String(item.regionId) === String(regionId)
      );
    }

    if (CITY_ID) {
      filtered = filtered.filter(
        (item) => String(item.CITY_ID) === String(CITY_ID)
      );
    }

    if (DISTRICT_ID) {
      filtered = filtered.filter(
        (item) => String(item.District_ID) === String(DISTRICT_ID)
      );
    }

    // ✅ Dynamic Field Filters
    if (FeaturedAds) {
      filtered = filtered.filter((item) => item.FeaturedAds === FeaturedAds);
    }

    if (isActive !== undefined) {
      filtered = filtered.filter((item) => {
        return String(item.isActive) === String(isActive);
      });
    }

    if (AdType) {
      filtered = filtered.filter((item) => item.AdType === AdType);
    }

    if (createdDate) {
      filtered = filtered.filter((item) => {
        const timestamp = item.createdAt?.seconds
          ? new Date(item.createdAt.seconds * 1000).toISOString().split("T")[0]
          : null;
        return timestamp === createdDate;
      });
    }

    // ✅ Handle any other dynamic filters passed in body
    Object.entries(otherFilters).forEach(([key, value]) => {
      filtered = filtered.filter((item) => {
        return item[key] === value;
      });
    });

    // ✅ Sort: Featured first, then newest
    filtered.sort((a, b) => {
      const aIsFeatured = a.FeaturedAds === "Featured Ads" ? 1 : 0;
      const bIsFeatured = b.FeaturedAds === "Featured Ads" ? 1 : 0;

      if (aIsFeatured !== bIsFeatured) {
        return bIsFeatured - aIsFeatured;
      }

      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });

    return res.status(200).json(filtered);
  } catch (error) {
    console.error("Error fetching FASHION:", error);
    return res.status(500).json({ error: "Error fetching FASHION" });
  }
});

module.exports = router;
