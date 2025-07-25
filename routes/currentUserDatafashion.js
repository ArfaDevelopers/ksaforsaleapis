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

        // ✅ Auto demote expired featured ads
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

    // ✅ Filter: Search Text (in title or subCategories)
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

    // ✅ Filter: Region
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

    // ✅ Filter: Featured Ads
    if (FeaturedAds) {
      filtered = filtered.filter((item) => item.FeaturedAds === FeaturedAds);
    }

    // ✅ Filter: isActive (ensure consistent type matching)
    if (isActive !== undefined) {
      filtered = filtered.filter((item) => {
        const val = item.isActive;
        return String(val) === String(isActive);
      });
    }

    // ✅ Filter: Ad Type
    if (AdType) {
      filtered = filtered.filter((item) => item.AdType === AdType);
    }

    // ✅ Filter: Created Date (ISO Date match)
    if (createdDate) {
      filtered = filtered.filter((item) => {
        const timestamp = item.createdAt?.seconds
          ? new Date(item.createdAt.seconds * 1000).toISOString().split("T")[0]
          : null;
        return timestamp === createdDate;
      });
    }

    // ✅ Apply any other dynamic filters
    Object.entries(otherFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        filtered = filtered.filter((item) => item[key] === value);
      }
    });

    // ✅ Sort: Featured first, then by date (newest first)
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
router.post("/ELECTRONICS", async (req, res) => {
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

    const snapshot = await db.collection("ELECTRONICS").get();
    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const data = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const docData = doc.data();
        const createdAt = docData.createdAt?.toDate?.() || null;

        // ✅ Auto demote expired featured ads
        if (
          docData.FeaturedAds === "Featured Ads" &&
          createdAt &&
          now - createdAt.getTime() > ONE_WEEK_MS
        ) {
          await db.collection("ELECTRONICS").doc(doc.id).update({
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

    // ✅ Filter: Search Text (in title or subCategories)
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

    // ✅ Filter: Region
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

    // ✅ Filter: Featured Ads
    if (FeaturedAds) {
      filtered = filtered.filter((item) => item.FeaturedAds === FeaturedAds);
    }

    // ✅ Filter: isActive
    if (isActive !== undefined) {
      filtered = filtered.filter((item) => {
        const val = item.isActive;
        return String(val) === String(isActive);
      });
    }

    // ✅ Filter: Ad Type
    if (AdType) {
      filtered = filtered.filter((item) => item.AdType === AdType);
    }

    // ✅ Filter: Created Date
    if (createdDate) {
      filtered = filtered.filter((item) => {
        const timestamp = item.createdAt?.seconds
          ? new Date(item.createdAt.seconds * 1000).toISOString().split("T")[0]
          : null;
        return timestamp === createdDate;
      });
    }

    // ✅ Apply dynamic filters
    Object.entries(otherFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        filtered = filtered.filter((item) => item[key] === value);
      }
    });

    // ✅ Sort: Featured first, then by createdAt (newest)
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
    console.error("Error fetching ELECTRONICS:", error);
    return res.status(500).json({ error: "Error fetching ELECTRONICS" });
  }
});
router.post("/HEALTHCARE", async (req, res) => {
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

    const snapshot = await db.collection("HEALTHCARE").get();
    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const data = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const docData = doc.data();
        const createdAt = docData.createdAt?.toDate?.() || null;

        // Auto demote expired featured ads
        if (
          docData.FeaturedAds === "Featured Ads" &&
          createdAt &&
          now - createdAt.getTime() > ONE_WEEK_MS
        ) {
          await db.collection("HEALTHCARE").doc(doc.id).update({
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

    // Search filter
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

    // Static filters
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

    // Dynamic filters
    if (FeaturedAds) {
      filtered = filtered.filter((item) => item.FeaturedAds === FeaturedAds);
    }

    if (isActive !== undefined) {
      filtered = filtered.filter(
        (item) => String(item.isActive) === String(isActive)
      );
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

    // Other dynamic filters
    Object.entries(otherFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        filtered = filtered.filter((item) => item[key] === value);
      }
    });

    // Sort: Featured first, then by date (newest)
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
    console.error("Error fetching HEALTHCARE:", error);
    return res.status(500).json({ error: "Error fetching HEALTHCARE" });
  }
});
router.post("/JOBBOARD", async (req, res) => {
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

    const snapshot = await db.collection("JOBBOARD").get();
    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const data = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const docData = doc.data();
        const createdAt = docData.createdAt?.toDate?.() || null;

        // Auto demote expired featured ads
        if (
          docData.FeaturedAds === "Featured Ads" &&
          createdAt &&
          now - createdAt.getTime() > ONE_WEEK_MS
        ) {
          await db.collection("JOBBOARD").doc(doc.id).update({
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

    // Search filter (title and subCategories)
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

    // Static filters
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

    // Dynamic field filters
    if (FeaturedAds) {
      filtered = filtered.filter((item) => item.FeaturedAds === FeaturedAds);
    }

    if (isActive !== undefined) {
      filtered = filtered.filter(
        (item) => String(item.isActive) === String(isActive)
      );
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

    // Apply other dynamic filters from body
    Object.entries(otherFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        filtered = filtered.filter((item) => item[key] === value);
      }
    });

    // Sort: Featured first, then by newest
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
    console.error("Error fetching JOBBOARD:", error);
    return res.status(500).json({ error: "Error fetching JOBBOARD" });
  }
});
router.post("/Education", async (req, res) => {
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

    const snapshot = await db.collection("Education").get();
    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const data = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const docData = doc.data();
        const createdAt = docData.createdAt?.toDate?.() || null;

        // Auto demote expired featured ads
        if (
          docData.FeaturedAds === "Featured Ads" &&
          createdAt &&
          now - createdAt.getTime() > ONE_WEEK_MS
        ) {
          await db.collection("Education").doc(doc.id).update({
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

    // Search filter (title and subCategories)
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

    // Static filters
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

    // Dynamic field filters
    if (FeaturedAds) {
      filtered = filtered.filter((item) => item.FeaturedAds === FeaturedAds);
    }

    if (isActive !== undefined) {
      filtered = filtered.filter(
        (item) => String(item.isActive) === String(isActive)
      );
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

    // Additional dynamic filters
    Object.entries(otherFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        filtered = filtered.filter((item) => item[key] === value);
      }
    });

    // Sort: Featured first, then by newest
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
    console.error("Error fetching Education:", error);
    return res.status(500).json({ error: "Error fetching Education" });
  }
});
router.get("/REALESTATECOMP", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const regionId = req.query.regionId;
    const CITY_ID = req.query.CITY_ID;
    const DISTRICT_ID = req.query.DISTRICT_ID;

    const snapshot = await db.collection("REALESTATECOMP").get();
    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const data = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const docData = doc.data();
        const featuredAt = docData.createdAt?.toDate?.() || null;

        // ✅ Auto demote expired Featured Ads
        if (
          docData.FeaturedAds === "Featured Ads" &&
          featuredAt &&
          now - featuredAt.getTime() > ONE_WEEK_MS
        ) {
          await db.collection("REALESTATECOMP").doc(doc.id).update({
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

    // ✅ Only show inactive items
    const inactiveData = data.filter((item) => {
      const isActive = item.isActive;
      return isActive !== true && isActive !== "true";
    });

    let filtered = inactiveData;

    // 🔍 Search filter (title or subCategories)
    if (searchText) {
      filtered = filtered.filter((item) => {
        const titleMatch = item.title?.toLowerCase().includes(searchText);
        const subCategoriesMatch = Array.isArray(item.subCategories)
          ? item.subCategories.some((cat) =>
              cat.toLowerCase().includes(searchText)
            )
          : false;
        return titleMatch || subCategoriesMatch;
      });
    }

    // ✅ Region filter
    if (regionId) {
      filtered = filtered.filter(
        (item) => String(item.regionId) === String(regionId)
      );
    }

    // ✅ City filter
    if (CITY_ID) {
      filtered = filtered.filter(
        (item) => String(item.CITY_ID) === String(CITY_ID)
      );
    }

    // ✅ District filter
    if (DISTRICT_ID) {
      filtered = filtered.filter(
        (item) => String(item.District_ID) === String(DISTRICT_ID)
      );
    }

    // ✅ Sort: Featured Ads first, then by newest
    filtered.sort((a, b) => {
      const aIsFeatured = a.FeaturedAds === "Featured Ads" ? 1 : 0;
      const bIsFeatured = b.FeaturedAds === "Featured Ads" ? 1 : 0;

      if (aIsFeatured !== bIsFeatured) {
        return bIsFeatured - aIsFeatured;
      }

      const aTime = a.createdAt?._seconds || 0;
      const bTime = b.createdAt?._seconds || 0;
      return bTime - aTime;
    });

    return res.status(200).json(filtered);
  } catch (error) {
    console.error("Error fetching REALESTATECOMP:", error);
    return res.status(500).json({ error: "Error fetching REALESTATECOMP" });
  }
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
