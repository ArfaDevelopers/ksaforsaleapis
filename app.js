const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const compression = require("compression");
const socketIo = require("socket.io");
const bodyParser = require("body-parser");
const createError = require("http-errors");
const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");
const fetchCarsRoute = require("./routes/fetchCars"); // adjust path

const bookmarkedListingsRouter = require("./routes/bookmarkedListings");

const listingsRoute = require("./routes/listings"); // ✅ path to your listings route
const relatedcarsRoute = require("./routes/relatedcars"); // ✅ path to your listings route
const currentUserDataRoute = require("./routes/currentUserData"); // ✅ path to your listings route
const realestateapidataRoute = require("./routes/realestateapidata"); // ✅ path to your listings route

const currentUserDatafashion = require("./routes/currentUserDatafashion"); // ✅ path to your listings route

const { getFirestore } = require("firebase-admin/firestore");

const http = require("http");
const { db } = require("./firebase/config"); // Firebase Firestore configuration
const twilio = require("twilio");
const stripe = require("stripe")(
  "sk_test_51Oqyo3Ap5li0mnBdPp3VP8q3NWQGnkM2CqvQkF6VV6GRPB0JdbNAX1UGIhjdlZghTj0MGg5GzRI5pHp5clQa9wAO005TR3ezz8"
); // Replace with your secret key

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
  },
});
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_SERVICE_SID = process.env.TWILIO_SERVICE_SID;

// const TWILIO_SERVICE_SID = "VA11fde75371f7e79949bcf4c1e6cb8fef";

// const TWILIO_ACCOUNT_SID = "AC1889f1661cd9d55526ddbf75143ca9a2";
// const TWILIO_AUTH_TOKEN = "3646885bb5e2f2adb574680251d84de5";
// Generate Access Token for User
const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
// const TWILIO_PHONE_NUMBER = "+12013895347"; // Your Twilio number
app.use(cors());
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  next();
});
app.use(express.json());
app.use(compression());

app.get("/", (_, res) => {
  return res.send("<a href='/route'>Click to redirect to /route</a>");
});
app.use("/api", listingsRoute); // your route is now GET /api/listings
app.use("/api", fetchCarsRoute);
app.use("/api", relatedcarsRoute); // your route is now GET /api/relatedcars
app.use("/currentUserData", currentUserDataRoute); // your route is now GET /api/relatedcars
app.use("/realestateapidata", realestateapidataRoute); // your route is now GET /api/relatedcars

app.use("/currentUserDatafashion", currentUserDatafashion); // your route is now GET /api/relatedcars

app.use("/route", require("./routes/route")); // Includes Twilio OTP + Firestore Cars
app.use("/api", bookmarkedListingsRouter); // So route is at /api/bookmarked-listings

const getOrCreateChat = async (sender, receiver) => {
  try {
    const chatRef = db.collection("chats");
    const existingChatSnapshot = await chatRef
      .where("participants", "array-contains", sender)
      .get();

    let chatDoc = null;

    existingChatSnapshot.forEach((doc) => {
      const chatData = doc.data();
      if (chatData.participants.includes(receiver)) {
        chatDoc = { id: doc.id, ...chatData };
      }
    });

    if (!chatDoc) {
      const newChatRef = await chatRef.add({
        participants: [sender, receiver],
        latestMessage: "",
        updated_at: new Date(),
      });

      chatDoc = { id: newChatRef.id };
    }

    return chatDoc;
  } catch (error) {
    console.error("Error getting/creating chat:", error);
  }
};
app.get("/search", async (req, res) => {
  const query = req.query.q?.toLowerCase();
  if (!query) return res.status(400).json({ error: "Missing query string" });

  const db = getFirestore();

  const collections = [
    "Cars",
    "ELECTRONICS",
    "Education",
    "FASHION",
    "HEALTHCARE",
    "JOBBOARD",
    "PETANIMALCOMP",
    "REALESTATECOMP",
    "SPORTSGAMESComp",
    "TRAVEL",
  ];

  try {
    const promises = collections.map((collectionName) =>
      db
        .collection(collectionName)
        .where("isActive", "==", false)
        .get()
        .then((snapshot) =>
          snapshot.docs
            .map((doc) => {
              const data = doc.data();
              const title = data.title?.toLowerCase() || "";
              if (title.includes(query)) {
                return {
                  id: doc.id,
                  title: data.title,
                  category: data.category,
                  subCategory: data.SubCategory,
                  image: data.galleryImages?.[0] || null,
                };
              }
              return null;
            })
            .filter(Boolean)
        )
    );

    const resultsArray = await Promise.all(promises);
    const results = resultsArray.flat();

    return res.json({ results });
  } catch (error) {
    console.error("Search error:", error);
    return res.status(500).json({ error: "Search failed" });
  }
});
app.get("/api/users", async (req, res) => {
  try {
    const snapshot = await db.collection("users").get();

    const totalUsers = snapshot.size; // snapshot.size gives the count of documents

    res.status(200).json({ totalUsers });
  } catch (error) {
    console.error("Firestore error:", error);
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/our-category-automative", async (req, res) => {
  try {
    const snapshot = await db.collection("OurCategoryAutomative").get();

    const items = snapshot.docs.map((doc) => {
      const { image, title } = doc.data();
      return { image, title };
    });

    res.status(200).json({ items });
  } catch (error) {
    console.error("Firestore error:", error);
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/our-category-automative1", async (req, res) => {
  try {
    const snapshot = await db.collection("OurCategoryAutomative").get();

    // Minimal data transformation for performance
    const items = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        title: data.Title || "",
        image: optimizeCloudinaryUrl(data.image || ""),
        timeAgo: data.timeAgo || "", // Or convert timestamp here if needed
      };
    });

    res.status(200).json({ items });
  } catch (error) {
    console.error("Firestore error:", error);
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/our-category-OurCategoryElectronics", async (req, res) => {
  try {
    const snapshot = await db.collection("OurCategoryElectronics").get();

    // Minimal data transformation for performance
    const items = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        title: data.Title || "",
        image: optimizeCloudinaryUrl(data.image || ""),
        timeAgo: data.timeAgo || "", // Or convert timestamp here if needed
      };
    });

    res.status(200).json({ items });
  } catch (error) {
    console.error("Firestore error:", error);
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/our-category-OurCategoryFashionStyle", async (req, res) => {
  try {
    const snapshot = await db.collection("OurCategoryFashionStyle").get();

    // Minimal data transformation for performance
    const items = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        title: data.Title || "",
        image: optimizeCloudinaryUrl(data.image || ""),
        timeAgo: data.timeAgo || "", // Or convert timestamp here if needed
      };
    });

    res.status(200).json({ items });
  } catch (error) {
    console.error("Firestore error:", error);
    res.status(500).json({ error: error.message });
  }
});
app.get("/REALESTATECOMP", async (req, res) => {
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
app.get("/TRAVEL", async (req, res) => {
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
app.get("/api/cities", async (req, res) => {
  try {
    let regionIds = req.query.REGION_ID;

    if (!regionIds) {
      return res.status(400).json({ error: "REGION_ID is required" });
    }

    // If only one REGION_ID is passed, make it an array
    if (!Array.isArray(regionIds)) {
      regionIds = [regionIds];
    }

    const filePath = path.join(__dirname, "data", "City.json");
    const fileData = fs.readFileSync(filePath, "utf8");
    const jsonData = JSON.parse(fileData);

    const headers = jsonData[0];
    const rows = jsonData.slice(1);

    const filteredCities = rows
      .filter((row) => regionIds.includes(row[0]))
      .map((row) => {
        const city = {};
        headers.forEach((key, index) => {
          city[key] = row[index];
        });
        return city;
      });

    res.status(200).json({ cities: filteredCities });
  } catch (error) {
    console.error("Error reading City.json:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// app.get("/api/cities", async (req, res) => {
//   try {
//     const { REGION_ID } = req.query;

//     if (!REGION_ID) {
//       return res.status(400).json({ error: "REGION_ID is required" });
//     }

//     const filePath = path.join(__dirname, "data", "City.json");
//     const fileData = fs.readFileSync(filePath, "utf8");
//     const jsonData = JSON.parse(fileData);

//     const headers = jsonData[0];
//     const rows = jsonData.slice(1);

//     const filteredCities = rows
//       .filter((row) => row[0] === REGION_ID) // row[0] is REGION_ID
//       .map((row) => {
//         const city = {};
//         headers.forEach((key, index) => {
//           city[key] = row[index];
//         });
//         return city;
//       });

//     res.status(200).json({ cities: filteredCities });
//   } catch (error) {
//     console.error("Error reading City.json:", error);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });
app.get("/api/districts", async (req, res) => {
  try {
    const { REGION_ID, CITY_ID } = req.query;

    if (!REGION_ID && !CITY_ID) {
      return res
        .status(400)
        .json({ error: "At least REGION_ID or CITY_ID is required" });
    }

    const filePath = path.join(__dirname, "data", "Districts.json");
    const fileData = fs.readFileSync(filePath, "utf8");
    const jsonData = JSON.parse(fileData);

    const headers = jsonData[0];
    const rows = jsonData.slice(1);

    const filteredDistricts = rows
      .filter((row) => {
        const matchesRegion = REGION_ID ? row[0] === REGION_ID : false;
        const matchesCity = CITY_ID ? row[1] === CITY_ID : false;
        return matchesRegion || matchesCity; // ✅ FIXED: allow either match
      })
      .map((row) => {
        const district = {};
        headers.forEach((key, index) => {
          district[key] = row[index];
        });
        return district;
      });

    res.status(200).json({ districts: filteredDistricts });
  } catch (error) {
    console.error("Error reading Districts.json:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
app.get("/api/our-category-OurCategoryHealthCare", async (req, res) => {
  try {
    const snapshot = await db.collection("OurCategoryHealthCare").get();

    // Minimal data transformation for performance
    const items = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        title: data.Title || "",
        image: optimizeCloudinaryUrl(data.image || ""),
        timeAgo: data.timeAgo || "", // Or convert timestamp here if needed
      };
    });

    res.status(200).json({ items });
  } catch (error) {
    console.error("Firestore error:", error);
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/our-category-OurCategoryJobBoardAutomative", async (req, res) => {
  try {
    const snapshot = await db.collection("OurCategoryJobBoardAutomative").get();

    // Minimal data transformation for performance
    const items = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        title: data.Title || "",
        image: optimizeCloudinaryUrl(data.image || ""),
        timeAgo: data.timeAgo || "", // Or convert timestamp here if needed
      };
    });

    res.status(200).json({ items });
  } catch (error) {
    console.error("Firestore error:", error);
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/our-category-OurCategoryTravelAutomative", async (req, res) => {
  try {
    const snapshot = await db.collection("OurCategoryTravelAutomative").get();

    // Minimal data transformation for performance
    const items = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        title: data.Title || "",
        image: optimizeCloudinaryUrl(data.image || ""),
        timeAgo: data.timeAgo || "", // Or convert timestamp here if needed
      };
    });

    res.status(200).json({ items });
  } catch (error) {
    console.error("Firestore error:", error);
    res.status(500).json({ error: error.message });
  }
});
app.get(
  "/api/our-category-OurCategoryRealEstateAutomative",
  async (req, res) => {
    try {
      const snapshot = await db
        .collection("OurCategoryRealEstateAutomative")
        .get();

      // Minimal data transformation for performance
      const items = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          title: data.Title || "",
          image: optimizeCloudinaryUrl(data.image || ""),
          timeAgo: data.timeAgo || "", // Or convert timestamp here if needed
        };
      });

      res.status(200).json({ items });
    } catch (error) {
      console.error("Firestore error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);
app.get(
  "/api/our-category-OurCategoryPetAnimalsAutomative",
  async (req, res) => {
    try {
      const snapshot = await db
        .collection("OurCategoryPetAnimalsAutomative")
        .get();

      // Minimal data transformation for performance
      const items = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          title: data.Title || "",
          image: optimizeCloudinaryUrl(data.image || ""),
          timeAgo: data.timeAgo || "", // Or convert timestamp here if needed
        };
      });

      res.status(200).json({ items });
    } catch (error) {
      console.error("Firestore error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);
app.get(
  "/api/our-category-OurCategorySportGamesAutomative",
  async (req, res) => {
    try {
      const snapshot = await db
        .collection("OurCategorySportGamesAutomative")
        .get();

      // Minimal data transformation for performance
      const items = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          title: data.Title || "",
          image: optimizeCloudinaryUrl(data.image || ""),
          timeAgo: data.timeAgo || "", // Or convert timestamp here if needed
        };
      });

      res.status(200).json({ items });
    } catch (error) {
      console.error("Firestore error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);
app.get(
  "/api/our-category-OurCategoryHouseHoldAutomative",
  async (req, res) => {
    try {
      const snapshot = await db
        .collection("OurCategoryHouseHoldAutomative")
        .get();

      // Minimal data transformation for performance
      const items = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          title: data.Title || "",
          image: optimizeCloudinaryUrl(data.image || ""),
          timeAgo: data.timeAgo || "", // Or convert timestamp here if needed
        };
      });

      res.status(200).json({ items });
    } catch (error) {
      console.error("Firestore error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);
app.get("/api/our-category-OurCategoryEducation", async (req, res) => {
  try {
    const snapshot = await db.collection("OurCategoryEducation").get();

    // Minimal data transformation for performance
    const items = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        title: data.Title || "",
        image: optimizeCloudinaryUrl(data.image || ""),
        timeAgo: data.timeAgo || "", // Or convert timestamp here if needed
      };
    });

    res.status(200).json({ items });
  } catch (error) {
    console.error("Firestore error:", error);
    res.status(500).json({ error: error.message });
  }
});
// Optional: Optimize image by transforming the Cloudinary URL
function optimizeCloudinaryUrl(url) {
  if (!url.includes("cloudinary.com")) return url;
  return url.replace("/upload/", "/upload/f_auto,q_auto,w_400,h_300,c_limit/");
}

app.get("/api/slider-images", async (req, res) => {
  try {
    const snapshot = await db.collection("SliderImage").limit(1).get();

    if (snapshot.empty) {
      return res.status(404).json({ message: "No slider images found." });
    }

    const docData = snapshot.docs[0].data();
    const imageUrls = docData.imageUrls || [];

    // Optimize Cloudinary URLs
    const optimizedImages = imageUrls.map((url) => optimizeCloudinaryUrl1(url));

    // Cache result for 1 hour
    res.setHeader("Cache-Control", "public, max-age=3600");

    res.status(200).json({ images: optimizedImages });
  } catch (error) {
    console.error("Error fetching slider images:", error);
    res.status(500).json({ error: error.message });
  }
});

// Helper to optimize image URLs
function optimizeCloudinaryUrl1(url) {
  if (!url.includes("cloudinary.com")) return url;

  return url.replace("/upload/", "/upload/f_auto,q_auto,w_1000,h_400,c_limit/");
}

// app.ge
// t("/search", async (req, res) => {
//   const query = req.query.q?.toLowerCase();
//   if (!query) return res.status(400).json({ error: "Missing query string" });

//   const db = getFirestore(); // or your DB initialization

//   // Collections to search in
//   const collections = [
//     "Cars",
//     "ELECTRONICS",
//     "Education",
//     "FASHION",
//     "HEALTHCARE",
//     "JOBBOARD",
//     "PETANIMALCOMP",
//     "REALESTATECOMP",
//     "SPORTSGAMESComp",
//     "TRAVEL",
//   ]; // your Firestore or MongoDB collection names

//   const results = [];

//   for (const collectionName of collections) {
//     const snapshot = await db
//       .collection(collectionName)
//       .where("isActive", "==", false)
//       .get();

//     snapshot.forEach((doc) => {
//       const data = doc.data();
//       const title = data.title?.toLowerCase() || "";
//       console.log("Checking title:", title); // DEBUG

//       if (title.includes(query)) {
//         results.push({
//           id: doc.id,
//           title: data.title,
//           category: data.category,
//           subCategory: data.SubCategory,
//           image: data.galleryImages?.[0] || null,
//         });
//       }
//     });
//   }

//   return res.json({ results });
// });
// Route to get a specific user by UID
app.get("/api/getAuthUserByUid", async (req, res) => {
  const { uid } = req.query; // Retrieve UID from query parameters

  try {
    const userRecord = await admin.auth().getUser(uid); // Fetch the user by UID
    const user = userRecord.toJSON(); // Convert the user record to JSON

    console.log("User found:", user); // Log the user data

    // Sending the user data to the frontend
    res.status(200).json({
      success: true,
      user: user,
    });
  } catch (error) {
    console.error("Error fetching user by UID:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
app.post("/api/delete-user", async (req, res) => {
  const uid = req.body.uid || req.query.uid; // Accept from body OR query

  if (!uid) {
    return res.status(400).json({ error: "UID is required" });
  }

  try {
    await admin.auth().deleteUser(uid);
    return res
      .status(200)
      .json({ message: `User ${uid} deleted from Firebase Authentication.` });
  } catch (error) {
    console.error("Error deleting user:", error.message);
    return res.status(500).json({ error: "Failed to delete user from Auth" });
  }
});

app.get("/api/getAuthUsers", async (req, res) => {
  try {
    const users = [];
    let result;

    // Fetch users in batches (1000 users at a time)
    do {
      result = await admin
        .auth()
        .listUsers(1000, result ? result.pageToken : undefined);
      result.users.forEach((userRecord) => {
        users.push(userRecord.toJSON()); // Convert to JSON to get necessary details
      });
    } while (result.pageToken); // Keep fetching until all users are fetched

    console.log("All authenticated users:", users); // Log to the console

    // Sending the users list to the frontend
    res.status(200).json({
      success: true,
      users: users,
    });
  } catch (error) {
    console.error("Error fetching users from Firebase Authentication:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
app.post("/api/charge", async (req, res) => {
  try {
    const { name, userId, productId, amount, paymentStatus, paymentMethodId } =
      req.body;

    // Validate and convert amount
    const convertedAmount = Math.round(Number(amount) * 100);

    if (isNaN(convertedAmount)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid amount value" });
    }

    // Create a PaymentIntent with Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: convertedAmount,
      currency: "usd",
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
    });

    // If payment is successful, store the data in Firestore
    if (paymentIntent.status === "succeeded") {
      await db.collection("Payments").add({
        name,
        userId,
        productId,
        amount: convertedAmount / 100, // Save as dollars
        paymentStatus: paymentIntent.status,
        paymentIntentId: paymentIntent.id,
        createdAt: new Date().toISOString(),
      });
    }

    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      message:
        paymentIntent.status === "succeeded"
          ? "Payment successful and saved."
          : "Payment initiated.",
    });
  } catch (error) {
    console.error("Error during payment processing:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
// Your existing imports here...
app.post("/api/chargestripe", async (req, res) => {
  try {
    const { paymentMethodId } = req.body;

    if (!paymentMethodId) {
      return res
        .status(400)
        .json({ success: false, error: "Missing payment method ID." });
    }

    const amount = 10; // $10 fixed charge
    const convertedAmount = Math.round(amount * 100); // Convert to cents

    // Create a PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: convertedAmount,
      currency: "usd",
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
    });

    if (paymentIntent.status === "succeeded") {
      // Save to Firestore
      await db.collection("Payments").add({
        amount,
        paymentStatus: paymentIntent.status,
        paymentIntentId: paymentIntent.id,
        createdAt: new Date().toISOString(),
      });

      return res.status(200).json({ success: true });
    } else {
      return res.status(400).json({ success: false, error: "Payment failed." });
    }
  } catch (error) {
    console.error("Payment error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// app.post("/api/charge", async (req, res) => {
//   try {
//     const { name, userId, productId, amount, paymentStatus, paymentMethodId } =
//       req.body;

//     // Create a PaymentIntent with Stripe
//     const paymentIntent = await stripe.paymentIntents.create({
//       amount: amount * 100, // Convert dollars to cents
//       currency: "usd",
//       payment_method: paymentMethodId,
//       confirm: true,
//       automatic_payment_methods: {
//         enabled: true,
//         allow_redirects: "never",
//       },
//     });

//     // If payment is successful, store the data in Firestore
//     if (paymentIntent.status === "succeeded") {
//       await db.collection("Payments").add({
//         name,
//         userId,
//         productId,
//         amount,
//         paymentStatus: paymentIntent.status,
//         paymentIntentId: paymentIntent.id,
//         createdAt: new Date().toISOString(),
//       });
//     }

//     res.status(200).json({
//       success: true,
//       clientSecret: paymentIntent.client_secret,
//       message:
//         paymentIntent.status === "succeeded"
//           ? "Payment successful and saved."
//           : "Payment initiated.",
//     });
//   } catch (error) {
//     console.error("Error during payment processing:", error);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//     });
//   }
// });
app.get("/api/user-data", async (req, res) => {
  try {
    const { userId, callingFrom } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId parameter" });
    }

    const collectionNames = [
      "Cars",
      "PETANIMALCOMP",
      "SPORTSGAMESComp",
      "REALESTATECOMP",
      "TRAVEL",
      "JOBBOARD",
      "HEALTHCARE",
      "FASHION",
      "Education",
      "ELECTRONICS",
    ];

    const allData = [];

    for (const name of collectionNames) {
      const snapshot = await db
        .collection(name)
        .where("userId", "==", userId)
        .get();
      snapshot.forEach((doc) => {
        allData.push({ id: doc.id, ...doc.data() });
      });
    }

    return res.status(200).json({ data: allData });
  } catch (error) {
    console.error("Error fetching user data:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});
app.get("/api/total-data-count", async (req, res) => {
  try {
    const collectionNames = [
      "Cars",
      "PETANIMALCOMP",
      "SPORTSGAMESComp",
      "REALESTATECOMP",
      "TRAVEL",
      "JOBBOARD",
      "HEALTHCARE",
      "FASHION",
      "Education",
      "ELECTRONICS",
    ];

    let totalCount = 0;

    for (const name of collectionNames) {
      const snapshot = await db.collection(name).get();
      totalCount += snapshot.size; // snapshot.size gives the number of documents
    }

    return res.status(200).json({ totalCount });
  } catch (error) {
    console.error("Error counting total data:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});
app.get("/api/total-favourite", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId parameter" });
    }

    const collectionNames = [
      "Cars",
      "PETANIMALCOMP",
      "SPORTSGAMESComp",
      "REALESTATECOMP",
      "TRAVEL",
      "JOBBOARD",
      "HEALTHCARE",
      "FASHION",
      "Education",
      "ELECTRONICS",
    ];

    let totalCount = 0;

    for (const name of collectionNames) {
      const snapshot = await db
        .collection(name)
        .where("userId", "==", userId)
        .where("bookmarked", "==", true)
        .get();

      totalCount += snapshot.size;
    }

    return res.status(200).json({ userId, totalBookmarked: totalCount });
  } catch (error) {
    console.error("Error counting favourites:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});
app.get("/api/total-messages", async (req, res) => {
  try {
    const snapshot = await db.collection("messages").get();
    const totalMessages = snapshot.size;

    return res.status(200).json({ totalMessages });
  } catch (error) {
    console.error("Error counting messages:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});
app.get("/api/totalAmount", async (req, res) => {
  try {
    const collectionNames = [
      "Cars",
      "PETANIMALCOMP",
      "SPORTSGAMESComp",
      "REALESTATECOMP",
      "TRAVEL",
      "JOBBOARD",
      "HEALTHCARE",
      "FASHION",
      "Education",
      "ELECTRONICS",
    ];

    for (const name of collectionNames) {
      const snapshot = await db.collection(name).get();

      console.log(`\nData from collection: ${name}`);
      snapshot.forEach((doc) => {
        console.log(doc.id, "=>", doc.data());
      });
    }

    return res.status(200).json({ message: "Data logged to console" });
  } catch (error) {
    console.error("Error fetching data from collections:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/collection-counts", async (req, res) => {
  try {
    const { name, userId, productId, amount, paymentStatus } = req.body;

    const collections = [
      "Cars",
      "users",
      "CommercialAdscom",
      "ELECTRONICS",
      "Education",
      "FASHION",
      "HEALTHCARE",
      "JOBBOARD",
      "REALESTATECOMP",
      "RealEstate",
      "SPORTSGAMESComp",
      "SliderImage",
    ];

    const counts = {};

    // Get counts for all collections
    await Promise.all(
      collections.map(async (collectionName) => {
        const snapshot = await db.collection(collectionName).get();
        counts[collectionName] = snapshot.size;
      })
    );

    // If payment was successful, store the data
    if (paymentStatus === "success") {
      await db.collection("Payments").add({
        name,
        userId,
        productId,
        amount,
        paymentStatus,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(200).json({
      success: true,
      data: counts,
      ...(paymentStatus === "success" && {
        message: "Payment data saved successfully.",
      }),
    });
  } catch (error) {
    console.error("Error in /api/collection-counts:", error);
    res.status(500).json({
      success: false,
      error: "An error occurred while processing the request.",
    });
  }
});

// app.get("/api/getmessages", async (req, res) => {
//   try {
//     const { userId, receiverId } = req.query;

//     if (!userId || !receiverId) {
//       return res.status(400).json({ error: "Missing userId or receiverId" });
//     }

//     const messagesRef = db.collection("messages");

//     // Fetch messages where `userId` is either sender or receiver
//     const senderQuerySnapshot = await messagesRef
//       .where("sender", "==", userId)
//       .get();
//     const receiverQuerySnapshot = await messagesRef
//       .where("receiver", "==", userId)
//       .get();

//     // Combine messages from both queries
//     const messages = [
//       ...senderQuerySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
//       ...receiverQuerySnapshot.docs.map((doc) => ({
//         id: doc.id,
//         ...doc.data(),
//       })),
//     ];

//     // Filter messages between userId and receiverId
//     const filteredMessages = messages.filter(
//       (msg) =>
//         (msg.sender === userId && msg.receiver === receiverId) ||
//         (msg.sender === receiverId && msg.receiver === userId)
//     );

//     // Sort messages by created_at
//     filteredMessages.sort((a, b) => a.created_at - b.created_at);

//     return res.status(200).json({ messages: filteredMessages });
//   } catch (error) {
//     console.error("Error fetching messages:", error.message);
//     return res.status(500).json({ error: "Internal server error" });
//   }
// });
app.get("/api/getmessages", async (req, res) => {
  try {
    const { userId, receiverId } = req.query;

    if (!userId || !receiverId) {
      return res.status(400).json({ error: "Missing userId or receiverId" });
    }

    const messagesRef = db.collection("messages");

    const senderQuerySnapshot = await messagesRef
      .where("sender", "==", userId)
      .get();
    const receiverQuerySnapshot = await messagesRef
      .where("receiver", "==", userId)
      .get();

    const messages = [
      ...senderQuerySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      ...receiverQuerySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })),
    ];

    const filteredMessages = messages.filter(
      (msg) =>
        (msg.sender === userId && msg.receiver === receiverId) ||
        (msg.sender === receiverId && msg.receiver === userId)
    );

    filteredMessages.sort((a, b) => a.created_at - b.created_at);

    return res.status(200).json({ messages: filteredMessages });
  } catch (error) {
    console.error("Error fetching messages:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});
app.get("/api/getusermessage", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    const messagesRef = db.collection("messages");

    // Fetch messages where the sender is the user
    const senderQuerySnapshot = await messagesRef
      .where("sender", "==", userId)
      .get();

    const messages = senderQuerySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Sort messages by created_at timestamp
    messages.sort((a, b) => a.created_at - b.created_at);

    return res.status(200).json({ messages });
  } catch (error) {
    console.error("Error fetching messages:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ** Listen to Firestore Database Changes and Emit Real-time Updates **
const messagesRef = db.collection("messages");
messagesRef.onSnapshot((snapshot) => {
  snapshot.docChanges().forEach((change) => {
    if (change.type === "added" || change.type === "modified") {
      io.emit("newMessage", { id: change.doc.id, ...change.doc.data() });
    }
  });
});
app.post("/api/call", async (req, res) => {
  const { to } = req.body;

  if (!to) {
    return res.status(400).json({ error: "Phone number is required" });
  }

  try {
    const call = await client.calls.create({
      url: "http://demo.twilio.com/docs/voice.xml", // Twilio XML for call handling
      to,
      from: TWILIO_PHONE_NUMBER,
    });

    res.status(200).json({ message: "Call initiated", callSid: call.sid });
  } catch (error) {
    console.error("Twilio Call Error:", error);
    res.status(500).json({ error: "Failed to make a call" });
  }
});
app.post("/api/messages", async (req, res) => {
  try {
    const { content, sender, receiver, from } = req.body;

    if (!content || !sender || !receiver) {
      return res
        .status(400)
        .json({ error: "Invalid message content or sender/receiver ID" });
    }

    // Get or create chat
    const chat = await getOrCreateChat(sender, receiver);

    const messageData = {
      sender,
      receiver,
      chat_id: chat.id,
      content,
      from,
      created_at: new Date(),
    };

    // Save message to Firestore
    await db.collection("messages").add(messageData);

    // Update latest message in chat
    await db.collection("chats").doc(chat.id).update({
      latestMessage: content,
      updated_at: new Date(),
      from,
    });

    // Emit the message in real-time using WebSockets
    io.emit("message", messageData);

    return res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: messageData,
    });
  } catch (error) {
    console.error("Error handling message:", error.message);
    return res.status(500).json({ error: error.message });
  }
});
app.get("/api/messages/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;

    // Fetch messages using chat_id
    const messagesRef = db.collection("messages");
    const querySnapshot = await messagesRef
      .where("chat_id", "==", chatId)
      .orderBy("created_at", "asc") // Sort messages in order
      .get();

    if (querySnapshot.empty) {
      return res.json({ success: true, data: [] });
    }

    const messages = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.json({ success: true, data: messages });
  } catch (error) {
    console.error("Error fetching messages:", error.message);
    return res.status(500).json({ error: error.message });
  }
});
app.get("/api/chat-id/:user1/:user2", async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    const messagesRef = db.collection("messages");

    // Find chat_id where sender & receiver match (in any order)
    const querySnapshot = await messagesRef
      .where("sender", "in", [user1, user2])
      .where("receiver", "in", [user1, user2])
      .limit(1) // Get only one matching chat_id
      .get();

    if (querySnapshot.empty) {
      return res.json({ success: false, message: "No chat found" });
    }

    const chatId = querySnapshot.docs[0].data().chat_id;
    return res.json({ success: true, chatId });
  } catch (error) {
    console.error("Error fetching chat_id:", error.message);
    return res.status(500).json({ error: error.message });
  }
});

// app.get("/api/messages/:sender/:receiver", async (req, res) => {
//   try {
//     const { sender, receiver } = req.params;

//     // Fetch messages where sender & receiver match OR vice versa
//     const messagesRef = db.collection("messages");
//     const querySnapshot = await messagesRef
//       .where("chat_id", "==", getChatId(sender, receiver)) // Ensures chat_id is used
//       .orderBy("created_at", "asc") // Sort messages in order
//       .get();

//     if (querySnapshot.empty) {
//       return res.json({ success: true, data: [] });
//     }

//     const messages = querySnapshot.docs.map((doc) => ({
//       id: doc.id,
//       ...doc.data(),
//     }));

//     return res.json({ success: true, data: messages });
//   } catch (error) {
//     console.error("Error fetching messages:", error.message);
//     return res.status(500).json({ error: error.message });
//   }
// });

// // Helper function to generate chat_id consistently
// function getChatId(user1, user2) {
//   return [user1, user2].sort().join("_");
// }

// Socket.io connection
io.on("connection", (socket) => {
  console.log("A user connected", socket.id);

  socket.on("message", async ({ content, sender, receiver, from }) => {
    try {
      if (!content || !sender || !receiver)
        throw new Error("Invalid message content or sender/receiver ID");

      const chat = await getOrCreateChat(sender, receiver);

      const messageData = {
        sender,
        receiver,
        chat_id: chat.id,
        content,
        from,
        created_at: new Date(),
      };

      // Save message to Firestore
      await db.collection("messages").add(messageData);

      // Update latest message in chat
      await db.collection("chats").doc(chat.id).update({
        latestMessage: content,
        updated_at: new Date(),
        from,
      });

      // Emit the message in real-time
      socket.broadcast.emit("message", messageData);
    } catch (error) {
      console.error("Error handling message:", error.message);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, PATCH, DELETE"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "x-access-token, Origin, X-Requested-With, Content-Type, Accept"
  );
  next(createError(404));
});

const PORT = process.env.PORT || 9002;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

module.exports = app;
