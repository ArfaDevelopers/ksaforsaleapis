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
router.post("/userData", async (req, res) => {
  const { userId } = req.body;
  console.log(userId, "userId__________");
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  try {
    // ✅ Correct lowercase collection name
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userDoc.data();

    return res.status(200).json({ user: userData });
  } catch (err) {
    console.error("Error fetching user data:", err);
    return res.status(500).json({ error: "Server error" });
  }
});
// router.post("/receivedMessages", async (req, res) => {
//   const { userId } = req.body;

//   if (!userId) {
//     return res.status(400).json({ error: "userId is required" });
//   }

//   try {
//     const messagesRef = db.collection("messages");
//     const snapshot = await messagesRef.where("recieverId", "==", userId).get();

//     if (snapshot.empty) {
//       return res.status(200).json({ messages: [] }); // No messages found
//     }

//     const messages = [];
//     snapshot.forEach((doc) => {
//       messages.push({
//         id: doc.id,
//         ...doc.data(),
//       });
//     });

//     return res.status(200).json({ messages });
//   } catch (err) {
//     console.error("Error fetching messages:", err);
//     return res.status(500).json({ error: "Failed to fetch messages" });
//   }
// });
router.post("/receivedMessages", async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  try {
    const messagesRef = db
      .collection("messages")
      .where("recieverId", "==", userId)
      .orderBy("createdAt", "desc") // Optional: order by latest first
      .limit(20); // ✅ Limit to 20 messages

    const snapshot = await messagesRef.get();

    if (snapshot.empty) {
      return res.status(200).json({ messages: [] });
    }

    const messages = [];
    snapshot.forEach((doc) => {
      messages.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    return res.status(200).json({ messages });
  } catch (err) {
    console.error("Error fetching messages:", err);
    return res.status(500).json({ error: "Failed to fetch messages" });
  }
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
router.get("/TRAVEL", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const regionId = req.query.regionId;
    const CITY_ID = req.query.CITY_ID;
    const DISTRICT_ID = req.query.DISTRICT_ID;

    const snapshot = await db.collection("TRAVEL").get();
    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const data = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const docData = doc.data();
        const featuredAt = docData.createdAt?.toDate?.() || null;

        // ✅ Auto demote Featured Ads after 7 days
        if (
          docData.FeaturedAds === "Featured Ads" &&
          featuredAt &&
          now - featuredAt.getTime() > ONE_WEEK_MS
        ) {
          await db.collection("TRAVEL").doc(doc.id).update({
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

    // ✅ Only return inactive ads
    const inactiveData = data.filter((item) => {
      const isActive = item.isActive;
      return isActive !== true && isActive !== "true";
    });

    let filtered = inactiveData;

    // 🔍 Filter: Search text (title or subCategories)
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

    // ✅ Filter: Region
    if (regionId) {
      filtered = filtered.filter(
        (item) => String(item.regionId) === String(regionId)
      );
    }

    // ✅ Filter: City
    if (CITY_ID) {
      filtered = filtered.filter(
        (item) => String(item.CITY_ID) === String(CITY_ID)
      );
    }

    // ✅ Filter: District
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
    console.error("Error fetching TRAVEL:", error);
    return res.status(500).json({ error: "Error fetching TRAVEL" });
  }
});
router.get("/SPORTSGAMESComp", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const regionId = req.query.regionId;
    const CITY_ID = req.query.CITY_ID;
    const DISTRICT_ID = req.query.DISTRICT_ID;

    const snapshot = await db.collection("SPORTSGAMESComp").get();
    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const data = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const docData = doc.data();
        const featuredAt = docData.createdAt?.toDate?.() || null;

        // ⏱️ Auto-expire Featured Ads after 7 days
        if (
          docData.FeaturedAds === "Featured Ads" &&
          featuredAt &&
          now - featuredAt.getTime() > ONE_WEEK_MS
        ) {
          await db.collection("SPORTSGAMESComp").doc(doc.id).update({
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

    // 🔍 Only include inactive ads
    const inactiveData = data.filter((item) => {
      const isActive = item.isActive;
      return isActive !== true && isActive !== "true";
    });

    let filtered = inactiveData;

    // 🔎 Search by title or subCategories
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

    // 🌍 Region filter
    if (regionId) {
      filtered = filtered.filter(
        (item) => String(item.regionId) === String(regionId)
      );
    }

    // 🏙️ City filter
    if (CITY_ID) {
      filtered = filtered.filter(
        (item) => String(item.CITY_ID) === String(CITY_ID)
      );
    }

    // 📍 District filter
    if (DISTRICT_ID) {
      filtered = filtered.filter(
        (item) => String(item.District_ID) === String(DISTRICT_ID)
      );
    }

    // 📊 Sort: Featured Ads first, then newest
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
    console.error("Error fetching SPORTSGAMESComp:", error);
    return res.status(500).json({ error: "Error fetching SPORTSGAMESComp" });
  }
});
router.get("/PETANIMALCOMP", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const regionId = req.query.regionId;
    const CITY_ID = req.query.CITY_ID;
    const DISTRICT_ID = req.query.DISTRICT_ID;

    const snapshot = await db.collection("PETANIMALCOMP").get();
    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const data = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const docData = doc.data();
        const createdAt = docData.createdAt?.toDate?.() || null;

        // ⏱️ Auto demote after 7 days
        if (
          docData.FeaturedAds === "Featured Ads" &&
          createdAt &&
          now - createdAt.getTime() > ONE_WEEK_MS
        ) {
          await db.collection("PETANIMALCOMP").doc(doc.id).update({
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

    // 🔍 Only include inactive items
    const inactiveItems = data.filter((item) => {
      const isActive = item.isActive;
      return isActive !== true && isActive !== "true";
    });

    let filtered = inactiveItems;

    // 🔍 Filter by searchText
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

    // ✅ Filter by region
    if (regionId) {
      filtered = filtered.filter(
        (item) => String(item.regionId) === String(regionId)
      );
    }

    // ✅ Filter by city
    if (CITY_ID) {
      filtered = filtered.filter(
        (item) => String(item.CITY_ID) === String(CITY_ID)
      );
    }

    // ✅ Filter by district
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
    console.error("Error fetching PETANIMALCOMP:", error);
    return res.status(500).json({ error: "Error fetching PETANIMALCOMP" });
  }
});
router.get("/Motors", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const regionId = req.query.regionId;
    const CITY_ID = req.query.CITY_ID;
    const DISTRICT_ID = req.query.DISTRICT_ID;

    const snapshot = await db.collection("Cars").get();
    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const data = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const docData = doc.data();
        const createdAt = docData.createdAt?.toDate?.() || null;

        // ⏱️ Auto demote after 7 days
        if (
          docData.FeaturedAds === "Featured Ads" &&
          createdAt &&
          now - createdAt.getTime() > ONE_WEEK_MS
        ) {
          await db.collection("PETANIMALCOMP").doc(doc.id).update({
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

    // 🔍 Only include inactive items
    const inactiveItems = data.filter((item) => {
      const isActive = item.isActive;
      return isActive !== true && isActive !== "true";
    });

    let filtered = inactiveItems;

    // 🔍 Filter by searchText
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

    // ✅ Filter by region
    if (regionId) {
      filtered = filtered.filter(
        (item) => String(item.regionId) === String(regionId)
      );
    }

    // ✅ Filter by city
    if (CITY_ID) {
      filtered = filtered.filter(
        (item) => String(item.CITY_ID) === String(CITY_ID)
      );
    }

    // ✅ Filter by district
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
    console.error("Error fetching PETANIMALCOMP:", error);
    return res.status(500).json({ error: "Error fetching PETANIMALCOMP" });
  }
});
router.get("/bookmarked-listings", async (req, res) => {
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
