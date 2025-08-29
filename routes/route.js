const { db, admin } = require("../firebase/config");
const express = require("express");
const router = express.Router();
const twilio = require("twilio");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid"); // For generating unique IDs
const { error } = require("console");
const FB = require("fb");

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
app.post("/call", async (req, res) => {
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

// Get all users
app.get("/api/users", async (req, res) => {
  try {
    const { data: users, error } = await supabase.from("users").select("*");

    if (error) throw error;
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get chats by user ID
app.get("/api/chats/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const { data: chats, error } = await supabase
      .from("chats")
      .select("*")
      .or(`senderId.eq.${userId},receiverId.eq.${userId}`);

    if (error) throw error;
    res.status(200).json(chats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get messages by chat ID
app.get("/api/messages/:chatId", async (req, res) => {
  const { chatId } = req.params;

  try {
    const { data: messages, error } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId);

    if (error) throw error;
    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/allmessages", async (req, res) => {
  try {
    const { data: messages, error } = await supabase
      .from("messages")
      .select("*");

    // Check for any errors
    if (error) throw error;

    // Respond with the retrieved messages
    res.status(200).json(messages);
  } catch (error) {
    // Handle errors by responding with a 500 status and the error message
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/getmessagesBySenderId", async (req, res) => {
  const { senderId } = req.query; // Retrieve senderId from query parameters

  try {
    // Build the query to select messages
    let query = supabase.from("messages").select("*");

    // If senderId is provided, filter messages by senderId
    if (senderId) {
      query = query.eq("sender", senderId);
    }

    const { data: messages, error } = await query; // Execute the query

    // Check for any errors
    if (error) throw error;

    // Respond with the retrieved messages
    res.status(200).json(messages);
  } catch (error) {
    // Handle errors by responding with a 500 status and the error message
    res.status(500).json({ error: error.message });
  }
});

// Get all leads
app.get("/api/leads", async (req, res) => {
  try {
    const { data: leads, error } = await supabase.from("leads").select("*");

    if (error) throw error;
    res.status(200).json(leads);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/leads", async (req, res) => {
  console.log("Request body:", req.body); // Log the request body

  try {
    let leads = req.body; // The leads data from the request body

    // Check if the leads data is an array; if not, convert it to an array
    if (!Array.isArray(leads)) {
      leads = [leads]; // Wrap the single lead object in an array
    }

    // Validate that we have valid leads data
    if (leads.length === 0) {
      return res.status(400).json({ error: "Invalid or empty leads data" });
    }

    // Insert the leads data into the leads table
    const { data, error } = await supabase.from("leads").insert(leads).select();

    if (error) {
      console.error("Error inserting leads:", error);
      throw error;
    }

    res.status(201).json({
      message: "Leads inserted successfully",
      data: data,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while inserting leads",
    });
  }
});

router.post("/call", async (req, res) => {
  const { to, receiverNumber } = req.body;

  try {
    const call = await client.calls.create({
      url: "http://demo.twilio.com/docs/voice.xml", // Twilio XML demo message
      to, // Receiver number (e.g., +923445101462)
      from: receiverNumber, // Your Twilio number or verified number
    });

    res
      .status(200)
      .json({ success: true, callSid: call.sid, calledNumber: to });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
router.post("/get-token", (req, res) => {
  const { identity } = req.body;

  const AccessToken = twilio.jwt.AccessToken;
  const ChatGrant = AccessToken.ChatGrant;

  const token = new AccessToken(
    TWILIO_ACCOUNT_SID,
    TWILIO_SERVICE_SID,
    TWILIO_AUTH_TOKEN,
    {
      identity,
    }
  );

  token.addGrant(new ChatGrant({ serviceSid: TWILIO_SERVICE_SID }));

  res.json({ token: token.toJwt() });
});

// Create Conversation
router.post("/create-conversation", async (req, res) => {
  try {
    const { friendlyName } = req.body;
    const conversation = await client.conversations.v1.conversations.create({
      friendlyName,
    });
    res.json(conversation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add User to Conversation
router.post("/add-user", async (req, res) => {
  try {
    const { identity } = req.body;
    const conversationSid = "CH33aa93f44dfb43018a23501b60c6aded"; // Hardcoded Conversation SID

    const participant = await client.conversations.v1
      .conversations(conversationSid)
      .participants.create({ identity });

    res.json(participant);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.get("/cars", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    let regionIds = req.query.regionId;
    const CITY_ID = req.query.CITY_ID;
    const DISTRICT_ID = req.query.DISTRICT_ID;
    const fromMileage = req.query.fromMileage
      ? Number(req.query.fromMileage)
      : null;
    const toMileage = req.query.toMileage ? Number(req.query.toMileage) : null;
    const sortBy = req.query.sortBy || "Sort by: Most Relevant"; // ✅

    const carsSnapshot = await db.collection("Cars").get();
    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const cars = await Promise.all(
      carsSnapshot.docs.map(async (doc) => {
        const carData = doc.data();
        const createdAt = carData.createdAt?.toDate?.() || null;

        // Auto-expire Featured Ads
        if (
          carData.FeaturedAds === "Featured Ads" &&
          createdAt &&
          now - createdAt.getTime() > ONE_WEEK_MS
        ) {
          await db.collection("Cars").doc(doc.id).update({
            FeaturedAds: "Not Featured Ads",
            featuredAt: null,
          });

          carData.FeaturedAds = "Not Featured Ads";
          carData.featuredAt = null;
        }

        return {
          id: doc.id,
          ...carData,
        };
      })
    );

    const inactiveCars = cars.filter((car) => {
      const isActive = car.isActive;
      return isActive !== true && isActive !== "true";
    });

    let filteredCars = inactiveCars;

    // 🔍 Search Text
    if (searchText) {
      filteredCars = filteredCars.filter((car) => {
        const titleMatch = car.title?.toLowerCase().includes(searchText);
        const subCategoriesMatch = Array.isArray(car.subCategories)
          ? car.subCategories.some((cat) =>
              cat.toLowerCase().includes(searchText)
            )
          : false;
        return titleMatch || subCategoriesMatch;
      });
    }

    // ✅ Multiple Region Filter
    if (regionIds) {
      if (!Array.isArray(regionIds)) {
        regionIds = [regionIds]; // convert to array
      }

      filteredCars = filteredCars.filter((car) =>
        regionIds.includes(String(car.regionId))
      );
    }

    // ✅ Single CITY_ID
    if (CITY_ID) {
      filteredCars = filteredCars.filter(
        (car) => String(car.CITY_ID) === String(CITY_ID)
      );
    }

    // ✅ Single DISTRICT_ID
    if (DISTRICT_ID) {
      filteredCars = filteredCars.filter(
        (car) => String(car.District_ID) === String(DISTRICT_ID)
      );
    }

    // ✅ Mileage filter
    if (fromMileage !== null && toMileage !== null) {
      filteredCars = filteredCars.filter((car) => {
        const mileage = Number(car.mileage) || 0;
        return mileage >= fromMileage && mileage <= toMileage;
      });
    }

    // ✅ Sorting
    if (sortBy === "Price: Low to High") {
      filteredCars.sort(
        (a, b) => (Number(a.Price) || 0) - (Number(b.Price) || 0)
      );
    } else if (sortBy === "Price: High to Low") {
      filteredCars.sort(
        (a, b) => (Number(b.Price) || 0) - (Number(a.Price) || 0)
      );
    } else {
      // Default -> Featured Ads first, then latest (by createdAt)
      filteredCars.sort((a, b) => {
        const aIsFeatured = a.FeaturedAds === "Featured Ads" ? 1 : 0;
        const bIsFeatured = b.FeaturedAds === "Featured Ads" ? 1 : 0;

        if (aIsFeatured !== bIsFeatured) {
          return bIsFeatured - aIsFeatured;
        }

        const aTime = a.createdAt?._seconds || 0;
        const bTime = b.createdAt?._seconds || 0;
        return bTime - aTime;
      });
    }

    return res.status(200).json(filteredCars);
  } catch (error) {
    console.error("Error fetching cars:", error);
    return res.status(500).json({ error: "Error fetching cars" });
  }
});

router.get("/carsSubCategories", async (req, res) => {
  try {
    const carsSnapshot = await db.collection("Cars").get();

    const categories = [
      "Cars For Sale",
      "Car Rental",
      "Plates Number",
      "Spare Parts",
      "Accessories",
      "Wheels & Rims",
      "Trucks & Heavy Machinery",
      "Tshaleeh",
      "Boats & Jet Ski",
      "Classic Cars",
      "Salvage Cars",
      "Mortgaged Cars",
      "Recovery",
      "Food Truck",
      "Caravans",
      "Reports",
      "Car Cleaning",
    ];

    const subCategoryCount = {};

    carsSnapshot.docs.forEach((doc) => {
      const carData = doc.data();

      // Consider only active listings (or remove this condition if not needed)
      if (carData.isActive !== false) {
        const subCat = (carData.SubCategory || "Unknown").trim();

        if (subCategoryCount[subCat]) {
          subCategoryCount[subCat]++;
        } else {
          subCategoryCount[subCat] = 1;
        }
      }
    });

    const result = categories.map((cat) => ({
      category: cat,
      count: subCategoryCount[cat] || 0,
    }));

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching car subcategories:", error);
    return res.status(500).json({ error: "Error fetching car subcategories" });
  }
});

router.get("/electronicsSubCategories", async (req, res) => {
  try {
    const electronicsSnapshot = await db.collection("ELECTRONICS").get();

    const categories = [
      "Mobile Phones",
      "Tablet Devices",
      "Computers & Laptops",
      "Video Games",
      "Television & Audio System",
      "Accounts & Subscriptions",
      "Special Number",
      "Home & Kitchen Appliance",
      "Motors & Generators",
      "Cameras",
      "Networking Devices",
      "Screens & Projectors",
      "Printer & Scanner",
      "Computer Accessories",
    ];

    const subCategoryCount = {};

    electronicsSnapshot.forEach((doc) => {
      const data = doc.data();
      const subCat = data.SubCategory || "Unknown";

      subCategoryCount[subCat] = (subCategoryCount[subCat] || 0) + 1;
    });

    const result = categories.map((cat) => ({
      category: cat,
      count: subCategoryCount[cat] || 0,
    }));

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching electronics subcategories:", error);
    return res.status(500).json({
      error: "Error fetching electronics subcategories",
    });
  }
});

// router.get("/cars", async (req, res) => {
//   try {
//     const searchText = req.query.searchText?.toLowerCase();
//     const regionId = req.query.regionId;
//     const CITY_ID = req.query.CITY_ID;
//     const DISTRICT_ID = req.query.DISTRICT_ID;

//     const carsSnapshot = await db.collection("Cars").get();
//     const now = Date.now();
//     const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

//     const cars = await Promise.all(
//       carsSnapshot.docs.map(async (doc) => {
//         const carData = doc.data();
//         const createdAt = carData.createdAt?.toDate?.() || null;

//         // Auto-expire Featured Ads after 7 days
//         if (
//           carData.FeaturedAds === "Featured Ads" &&
//           createdAt &&
//           now - createdAt.getTime() > ONE_WEEK_MS
//         ) {
//           await db.collection("Cars").doc(doc.id).update({
//             FeaturedAds: "Not Featured Ads",
//             featuredAt: null,
//           });

//           carData.FeaturedAds = "Not Featured Ads";
//           carData.featuredAt = null;
//         }

//         return {
//           id: doc.id,
//           ...carData,
//         };
//       })
//     );

//     // Filter only inactive cars
//     const inactiveCars = cars.filter((car) => {
//       const isActive = car.isActive;
//       return isActive !== true && isActive !== "true";
//     });

//     let filteredCars = inactiveCars;

//     // 🔍 Filter by searchText
//     if (searchText) {
//       filteredCars = filteredCars.filter((car) => {
//         const titleMatch = car.title?.toLowerCase().includes(searchText);
//         const subCategoriesMatch = Array.isArray(car.subCategories)
//           ? car.subCategories.some((cat) =>
//               cat.toLowerCase().includes(searchText)
//             )
//           : false;
//         return titleMatch || subCategoriesMatch;
//       });
//     }

//     // ✅ Filter by regionId
//     if (regionId) {
//       filteredCars = filteredCars.filter(
//         (car) => String(car.regionId) === String(regionId)
//       );
//     }

//     // ✅ Filter by CITY_ID
//     if (CITY_ID) {
//       filteredCars = filteredCars.filter(
//         (car) => String(car.CITY_ID) === String(CITY_ID)
//       );
//     }

//     // ✅ Filter by DISTRICT_ID
//     if (DISTRICT_ID) {
//       filteredCars = filteredCars.filter(
//         (car) => String(car.District_ID) === String(DISTRICT_ID)
//       );
//     }

//     // ✅ Sort: Featured Ads first, then by createdAt descending
//     filteredCars.sort((a, b) => {
//       const aIsFeatured = a.FeaturedAds === "Featured Ads" ? 1 : 0;
//       const bIsFeatured = b.FeaturedAds === "Featured Ads" ? 1 : 0;

//       if (aIsFeatured !== bIsFeatured) {
//         return bIsFeatured - aIsFeatured;
//       }

//       const aTime = a.createdAt?._seconds || 0;
//       const bTime = b.createdAt?._seconds || 0;
//       return bTime - aTime;
//     });

//     return res.status(200).json(filteredCars);
//   } catch (error) {
//     console.error("Error fetching cars:", error);
//     return res.status(500).json({ error: "Error fetching cars" });
//   }
// });

router.get("/commercial-ads", async (req, res) => {
  try {
    const adsSnapshot = await db.collection("CommercialAdscom").get();

    const ads = adsSnapshot.docs.map((doc) => {
      const data = doc.data();
      const rawTime = data.timeAgo;

      // Handle Firestore timestamp or ISO string
      let createdTime;
      if (rawTime?._seconds) {
        createdTime = new Date(rawTime._seconds * 1000);
      } else if (typeof rawTime === "string") {
        createdTime = new Date(rawTime);
      } else {
        createdTime = new Date(0); // fallback to epoch if unknown format
      }

      return {
        id: doc.id,
        ...data,
        createdAt: createdTime,
      };
    });

    // 🔽 Sort by createdAt DESC (latest first)
    ads.sort((a, b) => b.createdAt - a.createdAt);

    return res.status(200).json(ads);
  } catch (error) {
    console.error("Error fetching commercial ads:", error);
    return res.status(500).json({ error: "Error fetching commercial ads" });
  }
});

router.get("/PETANIMALCOMP", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase() || "";
    const sortBy = req.query.sortBy || "Sort by: Most Relevant";

    // ✅ Normalize query params to arrays
    const regionIds = req.query.regionId
      ? Array.isArray(req.query.regionId)
        ? req.query.regionId
        : req.query.regionId.split(",")
      : [];

    const cityIds = req.query.CITY_ID
      ? Array.isArray(req.query.CITY_ID)
        ? req.query.CITY_ID
        : req.query.CITY_ID.split(",")
      : [];

    const districtIds = req.query.DISTRICT_ID
      ? Array.isArray(req.query.DISTRICT_ID)
        ? req.query.DISTRICT_ID
        : req.query.DISTRICT_ID.split(",")
      : [];

    const snapshot = await db.collection("PETANIMALCOMP").get();
    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const data = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const docData = doc.data();
        const createdAt = docData.createdAt?.toDate?.() || null;

        // ✅ Auto-expire featured ads
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

        return { id: doc.id, ...docData };
      })
    );

    // ✅ Only active = false items
    let filtered = data.filter(
      (item) => !["true", true].includes(item.isActive)
    );

    // 🔍 Search filter
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
    if (regionIds.length > 0) {
      filtered = filtered.filter((item) =>
        regionIds.includes(String(item.regionId))
      );
    }

    // ✅ City filter
    if (cityIds.length > 0) {
      filtered = filtered.filter((item) =>
        cityIds.includes(String(item.CITY_ID))
      );
    }

    // ✅ District filter
    if (districtIds.length > 0) {
      filtered = filtered.filter((item) =>
        districtIds.includes(String(item.District_ID))
      );
    }

    // ✅ Sorting
    if (sortBy === "Price: Low to High") {
      filtered.sort((a, b) => (Number(a.Price) || 0) - (Number(b.Price) || 0));
    } else if (sortBy === "Price: High to Low") {
      filtered.sort((a, b) => (Number(b.Price) || 0) - (Number(a.Price) || 0));
    } else {
      // Default: Featured first → Newest
      filtered.sort((a, b) => {
        const aFeatured = a.FeaturedAds === "Featured Ads" ? 1 : 0;
        const bFeatured = b.FeaturedAds === "Featured Ads" ? 1 : 0;
        if (aFeatured !== bFeatured) return bFeatured - aFeatured;

        const aTime = a.createdAt?._seconds || 0;
        const bTime = b.createdAt?._seconds || 0;
        return bTime - aTime;
      });
    }

    return res.status(200).json(filtered);
  } catch (error) {
    console.error("Error fetching PETANIMALCOMP:", error);
    return res.status(500).json({ error: "Error fetching PETANIMALCOMP" });
  }
});

router.get("/ELECTRONICS", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();

    // ✅ Normalize query parameters to arrays
    let regionIds = req.query.regionId;
    let cityIds = req.query.CITY_ID;
    let districtIds = req.query.DISTRICT_ID;
    const sortBy = req.query.sortBy || "Sort by: Most Relevant"; // ✅

    if (regionIds && !Array.isArray(regionIds)) regionIds = [regionIds];
    if (cityIds && !Array.isArray(cityIds)) cityIds = [cityIds];
    if (districtIds && !Array.isArray(districtIds)) districtIds = [districtIds];

    const snapshot = await db.collection("ELECTRONICS").get();
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

    // ✅ Filter by multiple regionIds
    if (regionIds?.length) {
      filtered = filtered.filter((item) =>
        regionIds.includes(String(item.regionId))
      );
    }

    // ✅ Filter by multiple CITY_IDs
    if (cityIds?.length) {
      filtered = filtered.filter((item) =>
        cityIds.includes(String(item.CITY_ID))
      );
    }

    // ✅ Filter by multiple DISTRICT_IDs
    if (districtIds?.length) {
      filtered = filtered.filter((item) =>
        districtIds.includes(String(item.District_ID))
      );
    }

    // ✅ Sorting
    if (sortBy === "Price: Low to High") {
      filtered.sort((a, b) => (Number(a.Price) || 0) - (Number(b.Price) || 0));
    } else if (sortBy === "Price: High to Low") {
      filtered.sort((a, b) => (Number(b.Price) || 0) - (Number(a.Price) || 0));
    } else {
      // Default -> Featured Ads first, then latest (by createdAt)
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
    }

    return res.status(200).json(filtered);
  } catch (error) {
    console.error("Error fetching ELECTRONICS:", error);
    return res.status(500).json({ error: "Error fetching ELECTRONICS" });
  }
});

// router.get("/ELECTRONICS", async (req, res) => {
//   try {
//     const searchText = req.query.searchText?.toLowerCase();

//     const snapshot = await db.collection("ELECTRONICS").get();
//     const electronics = snapshot.docs
//       .map((doc) => ({
//         id: doc.id,
//         ...doc.data(),
//       }))
//       .filter((item) => {
//         const isActive = item.isActive;
//         return isActive !== true && isActive !== "true";
//       });

//     const filtered = searchText
//       ? electronics.filter((item) => {
//           const titleMatch = item.title?.toLowerCase().includes(searchText);
//           const subCategoriesMatch = Array.isArray(item.subCategories)
//             ? item.subCategories.some((cat) =>
//                 cat.toLowerCase().includes(searchText)
//               )
//             : false;
//           return titleMatch || subCategoriesMatch;
//         })
//       : electronics;

//     return res.status(200).json(filtered);
//   } catch (error) {
//     console.error("Error fetching ELECTRONICS:", error);
//     return res.status(500).json({ error: "Error fetching ELECTRONICS" });
//   }
// });

router.get("/REALESTATECOMP", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const sortBy = req.query.sortBy || "Sort by: Most Relevant"; // ✅ default

    // ✅ Handle multiple regionId, CITY_ID, DISTRICT_ID values
    const regionIds = req.query.regionId
      ? Array.isArray(req.query.regionId)
        ? req.query.regionId
        : req.query.regionId.split(",")
      : [];

    const cityIds = req.query.CITY_ID
      ? Array.isArray(req.query.CITY_ID)
        ? req.query.CITY_ID
        : req.query.CITY_ID.split(",")
      : [];

    const districtIds = req.query.DISTRICT_ID
      ? Array.isArray(req.query.DISTRICT_ID)
        ? req.query.DISTRICT_ID
        : req.query.DISTRICT_ID.split(",")
      : [];

    const snapshot = await db.collection("REALESTATECOMP").get();
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

    // ✅ Filter inactive items
    const inactiveItems = data.filter(
      (item) => !["true", true].includes(item.isActive)
    );

    let filtered = inactiveItems;

    // ✅ Search text filter
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

    // ✅ Multi-filter by regionId
    if (regionIds.length > 0) {
      filtered = filtered.filter((item) =>
        regionIds.includes(String(item.regionId))
      );
    }

    // ✅ Multi-filter by CITY_ID
    if (cityIds.length > 0) {
      filtered = filtered.filter((item) =>
        cityIds.includes(String(item.CITY_ID))
      );
    }

    // ✅ Multi-filter by DISTRICT_ID
    if (districtIds.length > 0) {
      filtered = filtered.filter((item) =>
        districtIds.includes(String(item.District_ID))
      );
    }

    // ✅ Sorting
    if (sortBy === "Price: Low to High") {
      filtered.sort((a, b) => (Number(a.Price) || 0) - (Number(b.Price) || 0));
    } else if (sortBy === "Price: High to Low") {
      filtered.sort((a, b) => (Number(b.Price) || 0) - (Number(a.Price) || 0));
    } else {
      // Default -> Featured Ads first, then newest
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
    }

    return res.status(200).json(filtered);
  } catch (error) {
    console.error("Error fetching REALESTATECOMP:", error);
    return res.status(500).json({ error: "Error fetching REALESTATECOMP" });
  }
});

router.get("/JOBBOARD", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const sortBy = req.query.sortBy || "Sort by: Most Relevant"; // ✅ default

    const regionIds = req.query.regionId
      ? Array.isArray(req.query.regionId)
        ? req.query.regionId
        : req.query.regionId.split(",")
      : [];

    const cityIds = req.query.CITY_ID
      ? Array.isArray(req.query.CITY_ID)
        ? req.query.CITY_ID
        : req.query.CITY_ID.split(",")
      : [];

    const districtIds = req.query.DISTRICT_ID
      ? Array.isArray(req.query.DISTRICT_ID)
        ? req.query.DISTRICT_ID
        : req.query.DISTRICT_ID.split(",")
      : [];

    const subCategory = req.query.SubCategory?.toLowerCase?.();

    const snapshot = await db.collection("JOBBOARD").get();
    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const data = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const docData = doc.data();
        const featuredAt = docData.createdAt?.toDate?.() || null;

        if (
          docData.FeaturedAds === "Featured Ads" &&
          featuredAt &&
          now - featuredAt.getTime() > ONE_WEEK_MS
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

    const inactiveData = data.filter(
      (item) => !["true", true].includes(item.isActive)
    );

    let filtered = inactiveData;

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

    if (regionIds.length > 0) {
      filtered = filtered.filter((item) =>
        regionIds.includes(String(item.regionId))
      );
    }

    if (cityIds.length > 0) {
      filtered = filtered.filter((item) =>
        cityIds.includes(String(item.CITY_ID))
      );
    }

    if (districtIds.length > 0) {
      filtered = filtered.filter((item) =>
        districtIds.includes(String(item.District_ID))
      );
    }

    if (subCategory) {
      filtered = filtered.filter(
        (item) => item.SubCategory?.toLowerCase() === subCategory
      );
    }

    // ✅ Sorting
    if (sortBy === "Price: Low to High") {
      filtered.sort((a, b) => (Number(a.Price) || 0) - (Number(b.Price) || 0));
    } else if (sortBy === "Price: High to Low") {
      filtered.sort((a, b) => (Number(b.Price) || 0) - (Number(a.Price) || 0));
    } else {
      // Default -> Featured Ads first, then newest
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
    }

    return res.status(200).json(filtered);
  } catch (error) {
    console.error("Error fetching JOBBOARD:", error);
    return res.status(500).json({ error: "Error fetching JOBBOARD" });
  }
});

router.get("/realEstateSubCategories", async (req, res) => {
  try {
    const snapshot = await db.collection("REALESTATECOMP").get();

    const predefinedCategories = [
      "Apartments for Rent",
      "Apartments for Sale",
      "Building for Rent",
      "Building for Sale",
      "Camps for Rent",
      "Chalets for Sale",
      "Commercial Lands for Sale",
      "Compound for Rent",
      "Compound for Sale",
      "Farm for Rent",
      "Farms for Sale",
      "Floor for Sale",
      "Floors for Rent",
      "Hall for Rent",
      "Houses for Rent",
      "Houses for Sale",
      "Lands for Sale",
      "Offices for Rent",
      "Rest Houses for Rent",
      "Rest Houses for Sale",
      "Rooms for Rent",
      "Shops for Rent",
      "Shops for Transfer",
      "Villas for Rent",
      "Villas for Sale",
      "Warehouse for Sale",
      "Warehouse for Rent",
    ];

    const countMap = {};

    snapshot.forEach((doc) => {
      const { SubCategory = "Unknown" } = doc.data();
      countMap[SubCategory] = (countMap[SubCategory] || 0) + 1;
    });

    const result = predefinedCategories.map((category) => ({
      category,
      count: countMap[category] || 0,
    }));

    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching real estate subcategories:", error);
    res.status(500).json({ error: "Error fetching real estate subcategories" });
  }
});

router.get("/travelSubCategories", async (req, res) => {
  try {
    const travelSnapshot = await db.collection("TRAVEL").get();

    const categories1 = [
      "Other Services",
      "Contracting Services",
      "Government Paperwork Services",
      "Delivery Services",
      "Furniture Moving Services",
      "Cleaning Services",
      "International Shopping Services",
      "Legal Services",
      "Accounting & Financial Services",
    ];

    const subCategoryCount = {};

    travelSnapshot.docs.forEach((doc) => {
      const data = doc.data();

      // ✅ Only include inactive or undefined isActive
      if (["true", true].includes(data.isActive)) return;

      const subCat = data.SubCategory || "Unknown";

      if (subCategoryCount[subCat]) {
        subCategoryCount[subCat]++;
      } else {
        subCategoryCount[subCat] = 1;
      }
    });

    const result = categories1.map((cat) => ({
      category: cat,
      count: subCategoryCount[cat] || 0,
    }));

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching travel subcategories:", error);
    return res
      .status(500)
      .json({ error: "Error fetching travel subcategories" });
  }
});

// router.get("/JOBBOARD", async (req, res) => {
//   try {
//     const searchText = req.query.searchText?.toLowerCase();

//     // ✅ Handle multiple regionId, CITY_ID, DISTRICT_ID values
//     const regionIds = req.query.regionId
//       ? Array.isArray(req.query.regionId)
//         ? req.query.regionId
//         : req.query.regionId.split(",")
//       : [];

//     const cityIds = req.query.CITY_ID
//       ? Array.isArray(req.query.CITY_ID)
//         ? req.query.CITY_ID
//         : req.query.CITY_ID.split(",")
//       : [];

//     const districtIds = req.query.DISTRICT_ID
//       ? Array.isArray(req.query.DISTRICT_ID)
//         ? req.query.DISTRICT_ID
//         : req.query.DISTRICT_ID.split(",")
//       : [];

//     const snapshot = await db.collection("JOBBOARD").get();
//     const now = Date.now();
//     const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

//     const data = await Promise.all(
//       snapshot.docs.map(async (doc) => {
//         const docData = doc.data();
//         const featuredAt = docData.createdAt?.toDate?.() || null;

//         if (
//           docData.FeaturedAds === "Featured Ads" &&
//           featuredAt &&
//           now - featuredAt.getTime() > ONE_WEEK_MS
//         ) {
//           await db.collection("JOBBOARD").doc(doc.id).update({
//             FeaturedAds: "Not Featured Ads",
//             featuredAt: null,
//           });

//           docData.FeaturedAds = "Not Featured Ads";
//           docData.featuredAt = null;
//         }

//         return {
//           id: doc.id,
//           ...docData,
//         };
//       })
//     );

//     // ✅ Filter inactive items
//     const inactiveData = data.filter(
//       (item) => !["true", true].includes(item.isActive)
//     );

//     let filtered = inactiveData;

//     // ✅ Filter by searchText
//     if (searchText) {
//       filtered = filtered.filter((item) => {
//         const titleMatch = item.title?.toLowerCase().includes(searchText);
//         const subCategoriesMatch = Array.isArray(item.subCategories)
//           ? item.subCategories.some((cat) =>
//               cat.toLowerCase().includes(searchText)
//             )
//           : false;
//         return titleMatch || subCategoriesMatch;
//       });
//     }

//     // ✅ Multi-filter by regionId
//     if (regionIds.length > 0) {
//       filtered = filtered.filter((item) =>
//         regionIds.includes(String(item.regionId))
//       );
//     }

//     // ✅ Multi-filter by CITY_ID
//     if (cityIds.length > 0) {
//       filtered = filtered.filter((item) =>
//         cityIds.includes(String(item.CITY_ID))
//       );
//     }

//     // ✅ Multi-filter by DISTRICT_ID
//     if (districtIds.length > 0) {
//       filtered = filtered.filter((item) =>
//         districtIds.includes(String(item.District_ID))
//       );
//     }

//     // ✅ Sort: Featured Ads first, then newest
//     filtered.sort((a, b) => {
//       const aIsFeatured = a.FeaturedAds === "Featured Ads" ? 1 : 0;
//       const bIsFeatured = b.FeaturedAds === "Featured Ads" ? 1 : 0;

//       if (aIsFeatured !== bIsFeatured) {
//         return bIsFeatured - aIsFeatured;
//       }

//       const aTime = a.createdAt?._seconds || 0;
//       const bTime = b.createdAt?._seconds || 0;
//       return bTime - aTime;
//     });

//     return res.status(200).json(filtered);
//   } catch (error) {
//     console.error("Error fetching JOBBOARD:", error);
//     return res.status(500).json({ error: "Error fetching JOBBOARD" });
//   }
// });
router.get("/jobBoardSubCategories", async (req, res) => {
  try {
    const jobSnapshot = await db.collection("JOBBOARD").get();

    const categories1 = [
      "Administrative Jobs",
      "Fashion & Beauty Jobs",
      "Security & Safety Jobs",
      "Teaching Jobs",
      "IT & Design Jobs",
      "Agriculture & Farming Jobs",
      "Industrial Jobs",
      "Medical & Nursing Jobs",
      "Architecture & Construction Jobs",
      "Housekeeping Jobs",
      "Restaurant Jobs",
    ];

    const subCategoryCount = {};

    jobSnapshot.docs.forEach((doc) => {
      const data = doc.data();

      // ✅ Skip active items
      if (["true", true].includes(data.isActive)) return;

      const subCat = data.SubCategory || "Unknown";

      if (subCategoryCount[subCat]) {
        subCategoryCount[subCat]++;
      } else {
        subCategoryCount[subCat] = 1;
      }
    });

    const result = categories1.map((cat) => ({
      category: cat,
      count: subCategoryCount[cat] || 0,
    }));

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching jobboard subcategories:", error);
    return res
      .status(500)
      .json({ error: "Error fetching jobboard subcategories" });
  }
});

router.get("/fashionSubCategories", async (req, res) => {
  try {
    const fashionSnapshot = await db.collection("FASHION").get();

    const categories1 = [
      "Watches",
      "Perfumes & Incense",
      "Sports Equipment",
      "Men's Fashion",
      "Women's Fashion",
      "Children's Clothing & Accessories",
      "Sleepwear",
      "Gifts",
      "Luggage",
      "Health & Beauty",
    ];

    const subCategoryCount = {};

    fashionSnapshot.docs.forEach((doc) => {
      const data = doc.data();

      // ✅ Only include inactive or undefined isActive
      if (["true", true].includes(data.isActive)) return;

      const subCat = data.SubCategory || "Unknown";

      if (subCategoryCount[subCat]) {
        subCategoryCount[subCat]++;
      } else {
        subCategoryCount[subCat] = 1;
      }
    });

    const result = categories1.map((cat) => ({
      category: cat,
      count: subCategoryCount[cat] || 0,
    }));

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching fashion subcategories:", error);
    return res
      .status(500)
      .json({ error: "Error fetching fashion subcategories" });
  }
});

router.get("/FASHION", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const sortBy = req.query.sortBy || "Sort by: Most Relevant"; // ✅

    // ✅ Handle multiple regionId, CITY_ID, DISTRICT_ID values
    const regionIds = req.query.regionId
      ? Array.isArray(req.query.regionId)
        ? req.query.regionId
        : req.query.regionId.split(",")
      : [];

    const cityIds = req.query.CITY_ID
      ? Array.isArray(req.query.CITY_ID)
        ? req.query.CITY_ID
        : req.query.CITY_ID.split(",")
      : [];

    const districtIds = req.query.DISTRICT_ID
      ? Array.isArray(req.query.DISTRICT_ID)
        ? req.query.DISTRICT_ID
        : req.query.DISTRICT_ID.split(",")
      : [];

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

    // Filter inactive items
    const inactiveItems = data.filter(
      (item) => !["true", true].includes(item.isActive)
    );

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

    // ✅ Multi-filter by regionId
    if (regionIds.length > 0) {
      filtered = filtered.filter((item) =>
        regionIds.includes(String(item.regionId))
      );
    }

    // ✅ Multi-filter by CITY_ID
    if (cityIds.length > 0) {
      filtered = filtered.filter((item) =>
        cityIds.includes(String(item.CITY_ID))
      );
    }

    // ✅ Multi-filter by DISTRICT_ID
    if (districtIds.length > 0) {
      filtered = filtered.filter((item) =>
        districtIds.includes(String(item.District_ID))
      );
    }

    // ✅ Sorting
    if (sortBy === "Price: Low to High") {
      filtered.sort((a, b) => (Number(a.Price) || 0) - (Number(b.Price) || 0));
    } else if (sortBy === "Price: High to Low") {
      filtered.sort((a, b) => (Number(b.Price) || 0) - (Number(a.Price) || 0));
    } else {
      // Default -> Featured Ads first, then newest
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
    }

    return res.status(200).json(filtered);
  } catch (error) {
    console.error("Error fetching FASHION:", error);
    return res.status(500).json({ error: "Error fetching FASHION" });
  }
});

router.get("/HEALTHCARE", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const sortBy = req.query.sortBy || "Sort by: Most Relevant"; // ✅

    // ✅ Handle multiple regionId, CITY_ID, DISTRICT_ID values
    const regionIds = req.query.regionId
      ? Array.isArray(req.query.regionId)
        ? req.query.regionId
        : req.query.regionId.split(",")
      : [];

    const cityIds = req.query.CITY_ID
      ? Array.isArray(req.query.CITY_ID)
        ? req.query.CITY_ID
        : req.query.CITY_ID.split(",")
      : [];

    const districtIds = req.query.DISTRICT_ID
      ? Array.isArray(req.query.DISTRICT_ID)
        ? req.query.DISTRICT_ID
        : req.query.DISTRICT_ID.split(",")
      : [];

    const snapshot = await db.collection("HEALTHCARE").get();
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

    // Filter inactive items
    const inactiveItems = data.filter(
      (item) => !["true", true].includes(item.isActive)
    );

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

    // ✅ Multi-filter by regionId
    if (regionIds.length > 0) {
      filtered = filtered.filter((item) =>
        regionIds.includes(String(item.regionId))
      );
    }

    // ✅ Multi-filter by CITY_ID
    if (cityIds.length > 0) {
      filtered = filtered.filter((item) =>
        cityIds.includes(String(item.CITY_ID))
      );
    }

    // ✅ Multi-filter by DISTRICT_ID
    if (districtIds.length > 0) {
      filtered = filtered.filter((item) =>
        districtIds.includes(String(item.District_ID))
      );
    }

    // ✅ Sorting
    if (sortBy === "Price: Low to High") {
      filtered.sort((a, b) => (Number(a.Price) || 0) - (Number(b.Price) || 0));
    } else if (sortBy === "Price: High to Low") {
      filtered.sort((a, b) => (Number(b.Price) || 0) - (Number(a.Price) || 0));
    } else {
      // Default -> Featured Ads first, then newest
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
    }

    return res.status(200).json(filtered);
  } catch (error) {
    console.error("Error fetching HEALTHCARE:", error);
    return res.status(500).json({ error: "Error fetching HEALTHCARE" });
  }
});

router.get("/healthcareSubCategories", async (req, res) => {
  try {
    const healthcareSnapshot = await db.collection("HEALTHCARE").get();

    const categories1 = [
      "Outdoor Furniture",
      "Majlis & Sofas",
      "Cabinets & Wardrobes",
      "Beds & Mattresses",
      "Tables & Chairs",
      "Kitchens",
      "Bathrooms",
      "Carpets",
      "Curtains",
      "Decoration & Accessories",
      "Lighting",
      "Household Items",
      "Garden - Plants",
      "Office Furniture",
      "Doors - Windows - Aluminium",
      "Tiles & Flooring",
    ];

    const subCategoryCount = {};

    healthcareSnapshot.docs.forEach((doc) => {
      const data = doc.data();

      // ✅ Skip active items
      if (["true", true].includes(data.isActive)) return;

      const subCat = data.SubCategory || "Unknown";

      if (subCategoryCount[subCat]) {
        subCategoryCount[subCat]++;
      } else {
        subCategoryCount[subCat] = 1;
      }
    });

    const result = categories1.map((cat) => ({
      category: cat,
      count: subCategoryCount[cat] || 0,
    }));

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching healthcare subcategories:", error);
    return res
      .status(500)
      .json({ error: "Error fetching healthcare subcategories" });
  }
});

// router.get("/TRAVEL", async (req, res) => {
//   try {
//     const searchText = req.query.searchText?.toLowerCase();
//     const regionId = req.query.regionId;
//     const CITY_ID = req.query.CITY_ID;
//     const DISTRICT_ID = req.query.DISTRICT_ID;

//     const snapshot = await db.collection("TRAVEL").get();

//     const data = snapshot.docs
//       .map((doc) => ({
//         id: doc.id,
//         ...doc.data(),
//       }))
//       .filter((item) => {
//         const isActive = item.isActive;
//         return isActive !== true && isActive !== "true"; // Only inactive items
//       });

//     let filtered = data;

//     // 🔍 Filter by searchText
//     if (searchText) {
//       filtered = filtered.filter((item) => {
//         const titleMatch = item.title?.toLowerCase().includes(searchText);
//         const subCategoriesMatch = Array.isArray(item.subCategories)
//           ? item.subCategories.some((cat) =>
//               cat.toLowerCase().includes(searchText)
//             )
//           : false;
//         return titleMatch || subCategoriesMatch;
//       });
//     }

//     // ✅ Filter by regionId
//     if (regionId) {
//       filtered = filtered.filter(
//         (item) => String(item.regionId) === String(regionId)
//       );
//     }

//     // ✅ Filter by CITY_ID
//     if (CITY_ID) {
//       filtered = filtered.filter(
//         (item) => String(item.CITY_ID) === String(CITY_ID)
//       );
//     }

//     // ✅ Filter by DISTRICT_ID
//     if (DISTRICT_ID) {
//       filtered = filtered.filter(
//         (item) => String(item.District_ID) === String(DISTRICT_ID)
//       );
//     }

//     // ✅ Sort: Featured Ads first, then by createdAt descending (newest first)
//     filtered.sort((a, b) => {
//       const aIsFeatured = a.FeaturedAds === "Featured Ads" ? 1 : 0;
//       const bIsFeatured = b.FeaturedAds === "Featured Ads" ? 1 : 0;

//       if (aIsFeatured !== bIsFeatured) {
//         return bIsFeatured - aIsFeatured;
//       }

//       const aTime = a.createdAt?._seconds || 0;
//       const bTime = b.createdAt?._seconds || 0;
//       return bTime - aTime; // Descending
//     });

//     return res.status(200).json(filtered);
//   } catch (error) {
//     console.error("Error fetching TRAVEL:", error);
//     return res.status(500).json({ error: "Error fetching TRAVEL" });
//   }
// });

router.get("/TRAVEL", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase() || "";
    const sortBy = req.query.sortBy || "Sort by: Most Relevant"; // ✅ default

    // Get region, city, district filters from query string
    const regionIds = req.query.regionId
      ? Array.isArray(req.query.regionId)
        ? req.query.regionId
        : req.query.regionId.split(",")
      : [];

    const cityIds = req.query.CITY_ID
      ? Array.isArray(req.query.CITY_ID)
        ? req.query.CITY_ID
        : req.query.CITY_ID.split(",")
      : [];

    const districtIds = req.query.DISTRICT_ID
      ? Array.isArray(req.query.DISTRICT_ID)
        ? req.query.DISTRICT_ID
        : req.query.DISTRICT_ID.split(",")
      : [];

    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const snapshot = await db.collection("TRAVEL").get();

    const data = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const docData = doc.data();
        const createdAt = docData.createdAt?.toDate?.() || null;

        // Auto-expire Featured Ads
        if (
          docData.FeaturedAds === "Featured Ads" &&
          createdAt &&
          now - createdAt.getTime() > ONE_WEEK_MS
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

    // Filter inactive only
    let filtered = data.filter(
      (item) => !["true", true].includes(item.isActive)
    );

    // Search filter
    if (searchText) {
      filtered = filtered.filter((item) => {
        const titleMatch = item.title?.toLowerCase().includes(searchText);
        const subCatMatch = Array.isArray(item.subCategories)
          ? item.subCategories.some((cat) =>
              cat.toLowerCase().includes(searchText)
            )
          : false;
        return titleMatch || subCatMatch;
      });
    }

    // Region filter
    if (regionIds.length > 0) {
      filtered = filtered.filter((item) =>
        regionIds.includes(String(item.regionId))
      );
    }

    // City filter
    if (cityIds.length > 0) {
      filtered = filtered.filter((item) =>
        cityIds.includes(String(item.CITY_ID))
      );
    }

    // District filter
    if (districtIds.length > 0) {
      filtered = filtered.filter((item) =>
        districtIds.includes(String(item.District_ID))
      );
    }

    // ✅ Sorting
    if (sortBy === "Price: Low to High") {
      filtered.sort((a, b) => (Number(a.Price) || 0) - (Number(b.Price) || 0));
    } else if (sortBy === "Price: High to Low") {
      filtered.sort((a, b) => (Number(b.Price) || 0) - (Number(a.Price) || 0));
    } else {
      // Default -> Featured Ads first, then newest
      filtered.sort((a, b) => {
        const aFeatured = a.FeaturedAds === "Featured Ads" ? 1 : 0;
        const bFeatured = b.FeaturedAds === "Featured Ads" ? 1 : 0;

        if (aFeatured !== bFeatured) return bFeatured - aFeatured;

        const aTime = a.createdAt?._seconds || 0;
        const bTime = b.createdAt?._seconds || 0;
        return bTime - aTime;
      });
    }

    return res.status(200).json(filtered);
  } catch (error) {
    console.error("Error fetching TRAVEL:", error);
    return res.status(500).json({ error: "Error fetching TRAVEL" });
  }
});

router.get("/SPORTSGAMESComp", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase() || "";
    const sortBy = req.query.sortBy || "Sort by: Most Relevant"; // ✅ default

    // ✅ Handle multi-value filters
    const regionIds = req.query.regionId
      ? Array.isArray(req.query.regionId)
        ? req.query.regionId
        : req.query.regionId.split(",")
      : [];

    const cityIds = req.query.CITY_ID
      ? Array.isArray(req.query.CITY_ID)
        ? req.query.CITY_ID
        : req.query.CITY_ID.split(",")
      : [];

    const districtIds = req.query.DISTRICT_ID
      ? Array.isArray(req.query.DISTRICT_ID)
        ? req.query.DISTRICT_ID
        : req.query.DISTRICT_ID.split(",")
      : [];

    const snapshot = await db.collection("SPORTSGAMESComp").get();
    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const data = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const docData = doc.data();
        const createdAt = docData.createdAt?.toDate?.() || null;

        // ✅ Auto-expire featured ads
        if (
          docData.FeaturedAds === "Featured Ads" &&
          createdAt &&
          now - createdAt.getTime() > ONE_WEEK_MS
        ) {
          await db.collection("SPORTSGAMESComp").doc(doc.id).update({
            FeaturedAds: "Not Featured Ads",
            featuredAt: null,
          });
          docData.FeaturedAds = "Not Featured Ads";
          docData.featuredAt = null;
        }

        return { id: doc.id, ...docData };
      })
    );

    // ✅ Filter inactive
    let filtered = data.filter(
      (item) => !["true", true].includes(item.isActive)
    );

    // ✅ Search filter
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
    if (regionIds.length > 0) {
      filtered = filtered.filter((item) =>
        regionIds.includes(String(item.regionId))
      );
    }

    // ✅ City filter
    if (cityIds.length > 0) {
      filtered = filtered.filter((item) =>
        cityIds.includes(String(item.CITY_ID))
      );
    }

    // ✅ District filter
    if (districtIds.length > 0) {
      filtered = filtered.filter((item) =>
        districtIds.includes(String(item.District_ID))
      );
    }

    // ✅ Sorting
    if (sortBy === "Price: Low to High") {
      filtered.sort((a, b) => (Number(a.Price) || 0) - (Number(b.Price) || 0));
    } else if (sortBy === "Price: High to Low") {
      filtered.sort((a, b) => (Number(b.Price) || 0) - (Number(a.Price) || 0));
    } else {
      // Default → Featured first, then newest
      filtered.sort((a, b) => {
        const aFeatured = a.FeaturedAds === "Featured Ads" ? 1 : 0;
        const bFeatured = b.FeaturedAds === "Featured Ads" ? 1 : 0;
        if (aFeatured !== bFeatured) return bFeatured - aFeatured;

        const aTime = a.createdAt?._seconds || 0;
        const bTime = b.createdAt?._seconds || 0;
        return bTime - aTime;
      });
    }

    return res.status(200).json(filtered);
  } catch (error) {
    console.error("Error fetching SPORTSGAMESComp:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/sportsGamesSubCategories", async (req, res) => {
  try {
    const sportsSnapshot = await db.collection("SPORTSGAMESComp").get();

    const categories1 = [
      "Gaming Consoles",
      "Video Games",
      "Controllers",
      "Gaming Accessories",
      "Gift Cards",
      "Accounts",
      "Toys",
    ];

    const subCategoryCount = {};

    sportsSnapshot.docs.forEach((doc) => {
      const data = doc.data();

      // ✅ Skip active listings
      if (["true", true].includes(data.isActive)) return;

      const subCat = data.SubCategory || "Unknown";

      if (subCategoryCount[subCat]) {
        subCategoryCount[subCat]++;
      } else {
        subCategoryCount[subCat] = 1;
      }
    });

    const result = categories1.map((cat) => ({
      category: cat,
      count: subCategoryCount[cat] || 0,
    }));

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching sports & games subcategories:", error);
    return res
      .status(500)
      .json({ error: "Error fetching sports & games subcategories" });
  }
});

router.get("/petAnimalSubCategories", async (req, res) => {
  try {
    const snapshot = await db.collection("PETANIMALCOMP").get();

    const categories1 = [
      "Sheep",
      "Goats",
      "Parrot",
      "Dove/Pigeon",
      "Cats",
      "Chickens",
      "Camels",
      "Horses",
      "Dogs",
      "Cows",
      "Fish & Turtles",
      "Rabbits",
      "Ducks",
      "Squirrels",
      "Hamsters",
      "Fur",
    ];

    const subCategoryCount = {};

    snapshot.docs.forEach((doc) => {
      const data = doc.data();

      // ✅ Only include if isActive is false or not set
      if (["true", true].includes(data.isActive)) return;

      const subCat = data.SubCategory || "Unknown";

      if (subCategoryCount[subCat]) {
        subCategoryCount[subCat]++;
      } else {
        subCategoryCount[subCat] = 1;
      }
    });

    const result = categories1.map((cat) => ({
      category: cat,
      count: subCategoryCount[cat] || 0,
    }));

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching pet animal subcategories:", error);
    return res
      .status(500)
      .json({ error: "Error fetching pet animal subcategories" });
  }
});

router.get("/Education", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase() || "";
    const subCategory = req.query.SubCategory?.toLowerCase().trim() || "";
    let sortBy = req.query.SortBy || "Newest"; // default

    // 🔹 Normalize SortBy values
    sortBy = sortBy.trim();
    if (sortBy.toLowerCase() === "price: low to high") sortBy = "priceLow";
    if (sortBy.toLowerCase() === "price: high to low") sortBy = "priceHigh";
    if (sortBy.toLowerCase() === "newest") sortBy = "newest";

    // ✅ Normalize filters
    const regionIds = req.query.regionId
      ? Array.isArray(req.query.regionId)
        ? req.query.regionId
        : req.query.regionId.split(",")
      : [];

    const cityIds = req.query.CITY_ID
      ? Array.isArray(req.query.CITY_ID)
        ? req.query.CITY_ID
        : req.query.CITY_ID.split(",")
      : [];

    const districtIds = req.query.DISTRICT_ID
      ? Array.isArray(req.query.DISTRICT_ID)
        ? req.query.DISTRICT_ID
        : req.query.DISTRICT_ID.split(",")
      : [];

    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const snapshot = await db.collection("Education").get();

    const data = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const docData = doc.data();
        const createdAt = docData.createdAt?.toDate?.() || null;

        // Auto-expire Featured Ads after 1 week
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

        return { id: doc.id, ...docData };
      })
    );

    // ✅ Only inactive ads
    let filtered = data.filter(
      (item) => !["true", true].includes(item.isActive)
    );

    // 🔍 Search filter
    if (searchText) {
      filtered = filtered.filter((item) => {
        const titleMatch = item.title?.toLowerCase().includes(searchText);
        const subCatMatch = Array.isArray(item.subCategories)
          ? item.subCategories.some((cat) =>
              cat.toLowerCase().includes(searchText)
            )
          : false;
        return titleMatch || subCatMatch;
      });
    }

    // ✅ SubCategory filter
    if (subCategory) {
      filtered = filtered.filter(
        (item) => item.SubCategory?.toLowerCase().trim() === subCategory
      );
    }

    // ✅ Region filter
    if (regionIds.length > 0) {
      filtered = filtered.filter((item) =>
        regionIds.includes(String(item.regionId))
      );
    }

    // ✅ City filter
    if (cityIds.length > 0) {
      filtered = filtered.filter((item) =>
        cityIds.includes(String(item.CITY_ID))
      );
    }

    // ✅ District filter
    if (districtIds.length > 0) {
      filtered = filtered.filter((item) =>
        districtIds.includes(String(item.District_ID))
      );
    }

    // ✅ Sorting logic
    filtered.sort((a, b) => {
      const aFeatured = a.FeaturedAds === "Featured Ads" ? 1 : 0;
      const bFeatured = b.FeaturedAds === "Featured Ads" ? 1 : 0;

      // Featured Ads first
      if (aFeatured !== bFeatured) return bFeatured - aFeatured;

      if (sortBy === "priceLow") {
        return (Number(a.Price) || 0) - (Number(b.Price) || 0);
      }
      if (sortBy === "priceHigh") {
        return (Number(b.Price) || 0) - (Number(a.Price) || 0);
      }

      // Default = newest
      const aTime = a.createdAt?._seconds || 0;
      const bTime = b.createdAt?._seconds || 0;
      return bTime - aTime;
    });

    return res.status(200).json(filtered);
  } catch (error) {
    console.error("Error fetching Education:", error);
    return res.status(500).json({ error: "Error fetching Education" });
  }
});

router.get("/educationSubCategories", async (req, res) => {
  try {
    const snapshot = await db.collection("Education").get();

    const categories1 = [
      "Hunting & Trips",
      "Gardening & Agriculture",
      "Parties & Events",
      "Travel & Tourism",
      "Roommate",
      "Lost & Found",
      "Education & Training",
      "Sports Training",
      "Stock & Forex Education",
      "Driving Lessons",
      "Private Tutoring",
      "Training Courses",
      "Antiques & Collectibles",
      "Projects & Investments",
      "Books & Arts",
      "Programming & Design",
      "Food & Beverages",
    ];

    const subCategoryCount = {};

    snapshot.docs.forEach((doc) => {
      const data = doc.data();

      // ✅ Only count if isActive is false or "false"
      if (["true", true].includes(data.isActive)) return;

      const subCat = data.SubCategory || "Unknown";

      if (subCategoryCount[subCat]) {
        subCategoryCount[subCat]++;
      } else {
        subCategoryCount[subCat] = 1;
      }
    });

    const result = categories1.map((cat) => ({
      category: cat,
      count: subCategoryCount[cat] || 0,
    }));

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching education subcategories:", error);
    return res
      .status(500)
      .json({ error: "Error fetching education subcategories" });
  }
});

router.get("/getItemById", async (req, res) => {
  try {
    const { callingFrom, id } = req.query;

    if (!callingFrom || !id) {
      return res.status(400).json({ error: "Missing callingFrom or id" });
    }

    // ✅ Complete mapping from frontend category to Firestore collection name
    const collectionMap = {
      automotive: "Cars",
      Automotive: "Cars",
      AutomotiveComp: "Cars",

      Motors: "Cars",
      RealEstateComp: "REALESTATECOMP",
      RealEstate: "REALESTATECOMP",

      Electronic: "ELECTRONICS",

      ElectronicComp: "ELECTRONICS",
      TravelComp: "TRAVEL",
      HealthCareComp: "HEALTHCARE",
      HealthCare: "HEALTHCARE",

      Other: "Education",
      Education: "Education",
      PetAnimalsComp: "PETANIMALCOMP",
      "Sports & Game": "SPORTSGAMESComp",
      GamesSport: "SPORTSGAMESComp",

      FashionStyle: "FASHION",
      JobBoard: "JOBBOARD",

      SportGamesComp: "SPORTSGAMESComp",
      ComercialsAds: "ComercialsAds",
      books: "books",
    };

    const collectionName = collectionMap[callingFrom];

    if (!collectionName) {
      return res.status(400).json({ error: "Invalid callingFrom value" });
    }

    const docSnap = await db.collection(collectionName).doc(id).get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: "Item not found" });
    }

    const data = docSnap.data();

    return res.status(200).json({
      id: docSnap.id,
      ...data,
    });
  } catch (error) {
    console.error("Error fetching item by ID:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// router.patch("/cars/:id/view", async (req, res) => {
//   const carId = req.params.id;

//   try {
//     const carRef = db.collection("Cars").doc(carId);
//     const carDoc = await carRef.get();

//     if (!carDoc.exists) {
//       return res.status(404).json({ error: "Car not found" });
//     }

//     const carData = carDoc.data();
//     const currentViews = carData.views || 0;

//     await carRef.update({
//       views: currentViews + 1,
//     });

//     return res.status(200).json({ message: "View count updated" });
//   } catch (error) {
//     console.error("Error updating view count:", error);
//     return res.status(500).json({ error: "Error updating view count" });
//   }
// });

router.patch("/cars/:id/view", async (req, res) => {
  const carId = req.params.id;
  const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  const now = Date.now();

  try {
    const carRef = db.collection("Cars").doc(carId);
    const carDoc = await carRef.get();

    if (!carDoc.exists) {
      return res.status(404).json({ error: "Car not found" });
    }

    const carData = carDoc.data();
    const lastViewedTimestamp = carData.lastViewed || 0;

    // If the last view was within the cooldown period (24 hours), reject the request
    if (now - lastViewedTimestamp < cooldownPeriod) {
      return res
        .status(429)
        .json({ message: "Please wait 24 hours before clicking again" });
    }

    // Update the view count and the timestamp of the last view
    await carRef.update({
      views: (carData.views || 0) + 1,
      lastViewed: now,
    });

    return res.status(200).json({ message: "View count updated" });
  } catch (error) {
    console.error("Error updating view count:", error);
    return res.status(500).json({ error: "Error updating view count" });
  }
});
router.patch("/REALESTATECOMP/:id/view", async (req, res) => {
  const carId = req.params.id;
  const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  const now = Date.now();

  try {
    const carRef = db.collection("REALESTATECOMP").doc(carId);
    const carDoc = await carRef.get();

    if (!carDoc.exists) {
      return res.status(404).json({ error: "REALESTATECOMP not found" });
    }

    const carData = carDoc.data();
    const lastViewedTimestamp = carData.lastViewed || 0;

    // If the last view was within the cooldown period (24 hours), reject the request
    if (now - lastViewedTimestamp < cooldownPeriod) {
      return res
        .status(429)
        .json({ message: "Please wait 24 hours before clicking again" });
    }

    // Update the view count and the timestamp of the last view
    await carRef.update({
      views: (carData.views || 0) + 1,
      lastViewed: now,
    });

    return res.status(200).json({ message: "View count updated" });
  } catch (error) {
    console.error("Error updating view count:", error);
    return res.status(500).json({ error: "Error updating view count" });
  }
});
router.patch("/ELECTRONICS/:id/view", async (req, res) => {
  const carId = req.params.id;
  const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  const now = Date.now();

  try {
    const carRef = db.collection("ELECTRONICS").doc(carId);
    const carDoc = await carRef.get();

    if (!carDoc.exists) {
      return res.status(404).json({ error: "ELECTRONICS not found" });
    }

    const carData = carDoc.data();
    const lastViewedTimestamp = carData.lastViewed || 0;

    // If the last view was within the cooldown period (24 hours), reject the request
    if (now - lastViewedTimestamp < cooldownPeriod) {
      return res
        .status(429)
        .json({ message: "Please wait 24 hours before clicking again" });
    }

    // Update the view count and the timestamp of the last view
    await carRef.update({
      views: (carData.views || 0) + 1,
      lastViewed: now,
    });

    return res.status(200).json({ message: "View count updated" });
  } catch (error) {
    console.error("Error updating view count:", error);
    return res.status(500).json({ error: "Error updating view count" });
  }
});
router.patch("/Education/:id/view", async (req, res) => {
  const carId = req.params.id;
  const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  const now = Date.now();

  try {
    const carRef = db.collection("Education").doc(carId);
    const carDoc = await carRef.get();

    if (!carDoc.exists) {
      return res.status(404).json({ error: "Education not found" });
    }

    const carData = carDoc.data();
    const lastViewedTimestamp = carData.lastViewed || 0;

    // If the last view was within the cooldown period (24 hours), reject the request
    if (now - lastViewedTimestamp < cooldownPeriod) {
      return res
        .status(429)
        .json({ message: "Please wait 24 hours before clicking again" });
    }

    // Update the view count and the timestamp of the last view
    await carRef.update({
      views: (carData.views || 0) + 1,
      lastViewed: now,
    });

    return res.status(200).json({ message: "View count updated" });
  } catch (error) {
    console.error("Error updating view count:", error);
    return res.status(500).json({ error: "Error updating view count" });
  }
});
router.patch("/SPORTSGAMESComp/:id/view", async (req, res) => {
  const carId = req.params.id;
  const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  const now = Date.now();

  try {
    const carRef = db.collection("SPORTSGAMESComp").doc(carId);
    const carDoc = await carRef.get();

    if (!carDoc.exists) {
      return res.status(404).json({ error: "Car not found" });
    }

    const carData = carDoc.data();
    const lastViewedTimestamp = carData.lastViewed || 0;

    // If the last view was within the cooldown period (24 hours), reject the request
    if (now - lastViewedTimestamp < cooldownPeriod) {
      return res
        .status(429)
        .json({ message: "Please wait 24 hours before clicking again" });
    }

    // Update the view count and the timestamp of the last view
    await carRef.update({
      views: (carData.views || 0) + 1,
      lastViewed: now,
    });

    return res.status(200).json({ message: "View count updated" });
  } catch (error) {
    console.error("Error updating view count:", error);
    return res.status(500).json({ error: "Error updating view count" });
  }
});
router.patch("/TRAVEL/:id/view", async (req, res) => {
  const carId = req.params.id;
  const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  const now = Date.now();

  try {
    const carRef = db.collection("TRAVEL").doc(carId);
    const carDoc = await carRef.get();

    if (!carDoc.exists) {
      return res.status(404).json({ error: "Car not found" });
    }

    const carData = carDoc.data();
    const lastViewedTimestamp = carData.lastViewed || 0;

    // If the last view was within the cooldown period (24 hours), reject the request
    if (now - lastViewedTimestamp < cooldownPeriod) {
      return res
        .status(429)
        .json({ message: "Please wait 24 hours before clicking again" });
    }

    // Update the view count and the timestamp of the last view
    await carRef.update({
      views: (carData.views || 0) + 1,
      lastViewed: now,
    });

    return res.status(200).json({ message: "View count updated" });
  } catch (error) {
    console.error("Error updating view count:", error);
    return res.status(500).json({ error: "Error updating view count" });
  }
});

router.patch("/JOBBOARD/:id/view", async (req, res) => {
  const carId = req.params.id;
  const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  const now = Date.now();

  try {
    const carRef = db.collection("JOBBOARD").doc(carId);
    const carDoc = await carRef.get();

    if (!carDoc.exists) {
      return res.status(404).json({ error: "JOBBOARD not found" });
    }

    const carData = carDoc.data();
    const lastViewedTimestamp = carData.lastViewed || 0;

    // If the last view was within the cooldown period (24 hours), reject the request
    if (now - lastViewedTimestamp < cooldownPeriod) {
      return res
        .status(429)
        .json({ message: "Please wait 24 hours before clicking again" });
    }

    // Update the view count and the timestamp of the last view
    await carRef.update({
      views: (carData.views || 0) + 1,
      lastViewed: now,
    });

    return res.status(200).json({ message: "View count updated" });
  } catch (error) {
    console.error("Error updating view count:", error);
    return res.status(500).json({ error: "Error updating view count" });
  }
});
router.patch("/HEALTHCARE/:id/view", async (req, res) => {
  const carId = req.params.id;
  const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  const now = Date.now();

  try {
    const carRef = db.collection("HEALTHCARE").doc(carId);
    const carDoc = await carRef.get();

    if (!carDoc.exists) {
      return res.status(404).json({ error: "Car not found" });
    }

    const carData = carDoc.data();
    const lastViewedTimestamp = carData.lastViewed || 0;

    // If the last view was within the cooldown period (24 hours), reject the request
    if (now - lastViewedTimestamp < cooldownPeriod) {
      return res
        .status(429)
        .json({ message: "Please wait 24 hours before clicking again" });
    }

    // Update the view count and the timestamp of the last view
    await carRef.update({
      views: (carData.views || 0) + 1,
      lastViewed: now,
    });

    return res.status(200).json({ message: "View count updated" });
  } catch (error) {
    console.error("Error updating view count:", error);
    return res.status(500).json({ error: "Error updating view count" });
  }
});
router.patch("/FASHION/:id/view", async (req, res) => {
  const carId = req.params.id;
  const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  const now = Date.now();

  try {
    const carRef = db.collection("FASHION").doc(carId);
    const carDoc = await carRef.get();

    if (!carDoc.exists) {
      return res.status(404).json({ error: "FASHION not found" });
    }

    const carData = carDoc.data();
    const lastViewedTimestamp = carData.lastViewed || 0;

    // If the last view was within the cooldown period (24 hours), reject the request
    if (now - lastViewedTimestamp < cooldownPeriod) {
      return res
        .status(429)
        .json({ message: "Please wait 24 hours before clicking again" });
    }

    // Update the view count and the timestamp of the last view
    await carRef.update({
      views: (carData.views || 0) + 1,
      lastViewed: now,
    });

    return res.status(200).json({ message: "View count updated" });
  } catch (error) {
    console.error("Error updating view count:", error);
    return res.status(500).json({ error: "Error updating view count" });
  }
});
router.patch("/PETANIMALCOMP/:id/view", async (req, res) => {
  const carId = req.params.id;
  const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  const now = Date.now();

  try {
    const carRef = db.collection("PETANIMALCOMP").doc(carId);
    const carDoc = await carRef.get();

    if (!carDoc.exists) {
      return res.status(404).json({ error: "PETANIMALCOMP not found" });
    }

    const carData = carDoc.data();
    const lastViewedTimestamp = carData.lastViewed || 0;

    // If the last view was within the cooldown period (24 hours), reject the request
    if (now - lastViewedTimestamp < cooldownPeriod) {
      return res
        .status(429)
        .json({ message: "Please wait 24 hours before clicking again" });
    }

    // Update the view count and the timestamp of the last view
    await carRef.update({
      views: (carData.views || 0) + 1,
      lastViewed: now,
    });

    return res.status(200).json({ message: "View count updated" });
  } catch (error) {
    console.error("Error updating view count:", error);
    return res.status(500).json({ error: "Error updating view count" });
  }
});
router.get("/trendingProducts", async (_, res) => {
  const collectionNames = [
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

  let allProducts = [];

  try {
    for (const name of collectionNames) {
      const snapshot = await db.collection(name).get();
      const items = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
          collection: name, // optional: helps identify the origin
        }))
        .filter(
          (item) =>
            item.isActive !== true &&
            item.isActive !== "true" &&
            typeof item.views === "number"
        ); // ensure views is numeric

      allProducts.push(...items);
    }

    // Sort by views descending
    const sortedByViews = allProducts.sort((a, b) => b.views - a.views);

    // Take top 5
    const top5 = sortedByViews.slice(0, 5);

    return res.status(200).json(top5);
  } catch (error) {
    console.error("Error fetching trending products:", error);
    return res.status(500).json({ error: "Error fetching trending products" });
  }
});
// POST /forgot-password/send-otp
router.post("/forgot-password/send-otp", async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res
      .status(400)
      .json({ success: false, message: "Phone number is required" });
  }

  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  if (!phoneRegex.test(phoneNumber)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid phone number format" });
  }

  try {
    // 🔍 Check if phone number exists in Firestore
    const usersRef = db.collection("users");
    const querySnapshot = await usersRef
      .where("phoneNumber", "==", phoneNumber)
      .get();

    if (querySnapshot.empty) {
      return res.status(404).json({
        success: false,
        message: "Phone number not found",
      });
    }

    // ✅ Send OTP using Twilio
    const response = await axios.post(
      `https://verify.twilio.com/v2/Services/${TWILIO_SERVICE_SID}/Verifications`,
      new URLSearchParams({
        To: phoneNumber,
        Channel: "sms",
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization:
            "Basic " +
            Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString(
              "base64"
            ),
        },
      }
    );

    return res.json({
      success: true,
      message: "OTP sent successfully",
      sid: response.data.sid,
    });
  } catch (error) {
    console.error("Send OTP Error:", error?.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP",
      error: error?.response?.data || error.message,
    });
  }
});
// router.post("/verifyChangepasswdotp", async (req, res) => {
//   const { phoneNumber, otp, newPassword } = req.body;

//   if (!phoneNumber || !otp || !newPassword) {
//     return res.status(400).json({
//       success: false,
//       message: "Missing required fields",
//     });
//   }

//   const normalizedPhone = phoneNumber.startsWith("+")
//     ? phoneNumber
//     : `+${phoneNumber}`;

//   try {
//     // 1. Verify OTP using Twilio
//     const verifyResponse = await axios.post(
//       `https://verify.twilio.com/v2/Services/${TWILIO_SERVICE_SID}/VerificationCheck`,
//       new URLSearchParams({
//         To: normalizedPhone,
//         Code: otp,
//       }).toString(),
//       {
//         headers: {
//           "Content-Type": "application/x-www-form-urlencoded",
//           Authorization: `Basic ${Buffer.from(
//             `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`
//           ).toString("base64")}`,
//         },
//       }
//     );

//     if (verifyResponse.data.status !== "approved") {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid OTP",
//       });
//     }

//     // 2. Search user by phone number in Firestore (not Realtime DB!)
//     const snapshot = await db
//       .collection("users")
//       .where("phoneNumber", "==", normalizedPhone)
//       .get();

//     if (snapshot.empty) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found in Firestore",
//       });
//     }

//     // 3. Update password field in Firestore document
//     const userDoc = snapshot.docs[0];
//     await userDoc.ref.update({
//       password: newPassword,
//       updatedAt: new Date().toISOString(),
//     });

//     return res.json({
//       success: true,
//       message: "OTP verified and password updated successfully",
//     });
//   } catch (error) {
//     console.error("Error updating password:", error.message);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to verify OTP or update password",
//       error: error.message,
//     });
//   }
// });
router.post("/verifyChangepasswdotp", async (req, res) => {
  const { phoneNumber, otp, newPassword } = req.body;

  if (!phoneNumber || !otp || !newPassword) {
    return res.status(400).json({
      success: false,
      message: "Phone number, OTP, and new password are required",
    });
  }

  const normalizedPhoneNumber = phoneNumber.startsWith("+")
    ? phoneNumber
    : `+${phoneNumber}`;

  try {
    // Step 1: Verify OTP
    const verificationCheck = await client.verify
      .services(process.env.TWILIO_SERVICE_SID)
      .verificationChecks.create({
        to: normalizedPhoneNumber,
        code: otp,
      });

    if (verificationCheck.status !== "approved") {
      return res.status(401).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    // Step 2: Look up user in Firestore
    const usersRef = db.collection("users");
    const snapshot = await usersRef
      .where("phoneNumber", "==", normalizedPhoneNumber)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({
        success: false,
        message: "User not found in Firestore",
      });
    }

    const userDoc = snapshot.docs[0];
    const userData = userDoc.data();
    const firestoreUID = userData.uid;

    let firebaseUser;
    try {
      // Try to get the user from Firebase Auth by phone number
      firebaseUser = await admin
        .auth()
        .getUserByPhoneNumber(normalizedPhoneNumber);
    } catch (authError) {
      if (authError.code === "auth/user-not-found") {
        // If not found by phone number, try to get by UID from Firestore
        try {
          firebaseUser = await admin.auth().getUser(firestoreUID);
          // If user exists by UID but not phone number, ensure phone number is set
          if (!firebaseUser.phoneNumber) {
            await admin.auth().updateUser(firebaseUser.uid, {
              phoneNumber: normalizedPhoneNumber,
            });
            firebaseUser = await admin.auth().getUser(firebaseUser.uid); // Refresh user object
          }
        } catch (uidError) {
          if (uidError.code === "auth/user-not-found") {
            // ✅ Create the user in Firebase Auth if not found by phone number OR UID
            firebaseUser = await admin.auth().createUser({
              uid: firestoreUID, // Use Firestore UID for consistency
              phoneNumber: normalizedPhoneNumber,
              password: newPassword,
              email: userData.email || undefined,
              displayName: userData.fullName || undefined,
            });
          } else {
            throw uidError; // Re-throw other UID related errors
          }
        }
      } else {
        throw authError; // Re-throw other phone number related errors
      }
    }

    // Step 3: Update password in Firebase Auth
    // This step is always executed if firebaseUser is successfully obtained or created
    await admin.auth().updateUser(firebaseUser.uid, {
      password: newPassword,
    });

    // Step 4: Clean up Firestore (remove plain text password if it was ever there)
    // and update timestamp
    await userDoc.ref.update({
      password: admin.firestore.FieldValue.delete(), // Ensure no plain text password remains
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: "OTP verified and Firebase password updated successfully",
    });
  } catch (error) {
    console.error("Error verifying OTP or updating password:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to verify OTP or update password",
      error: error.message || error,
    });
  }
});

// Send OTP
// router.post("/send-otp", async (req, res) => {
//   const { phone } = req.body;

//   if (!phone) {
//     return res
//       .status(400)
//       .json({ success: false, message: "Phone number is required" });
//   }

//   try {
//     const response = await axios.post(
//       `https://verify.twilio.com/v2/Services/${TWILIO_SERVICE_SID}/Verifications`,
//       new URLSearchParams({
//         To: phone,
//         Channel: "sms",
//       }).toString(),
//       {
//         headers: {
//           "Content-Type": "application/x-www-form-urlencoded",
//           Authorization: `Basic ${Buffer.from(
//             `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`
//           ).toString("base64")}`,
//         },
//       }
//     );

//     res.json({ success: true, message: "OTP sent successfully" });
//   } catch (error) {
//     console.error("Error sending OTP:", error);
//     res
//       .status(500)
//       .json({ success: false, message: "Error sending OTP", error });
//   }
// });
router.post("/send-otp", async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res
      .status(400)
      .json({ success: false, message: "Phone number is required" });
  }

  // Validate phone number format (E.164 format)
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  if (!phoneRegex.test(phone)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid phone number format" });
  }

  try {
    const response = await axios.post(
      `https://verify.twilio.com/v2/Services/${TWILIO_SERVICE_SID}/Verifications`,
      new URLSearchParams({
        To: phone,
        Channel: "sms",
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(
            `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`
          ).toString("base64")}`,
        },
      }
    );

    res.json({ success: true, message: "OTP sent successfully" });
  } catch (error) {
    console.error("Error sending OTP:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: "Error sending OTP",
      error: error.response?.data,
    });
  }
});

router.get("/EducationCarousal", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const regionId = req.query.regionId;
    const CITY_ID = req.query.CITY_ID;
    const DISTRICT_ID = req.query.DISTRICT_ID;

    const snapshot = await db.collection("Education").get();
    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const data = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const docData = doc.data();
        const featuredAt = docData.createdAt?.toDate?.() || null;

        if (
          docData.FeaturedAds === "Featured Ads" &&
          featuredAt &&
          now - featuredAt.getTime() > ONE_WEEK_MS
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

    const inactiveData = data.filter((item) => {
      const isActive = item.isActive;
      return isActive !== true && isActive !== "true";
    });

    let filtered = inactiveData;

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

    return res.status(200).json(filtered.slice(0, 10));
  } catch (error) {
    console.error("Error fetching Education:", error);
    return res.status(500).json({ error: "Error fetching Education" });
  }
});
router.get("/carsCarousal", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const regionId = req.query.regionId;
    const CITY_ID = req.query.CITY_ID;
    const DISTRICT_ID = req.query.DISTRICT_ID;

    const carsSnapshot = await db.collection("Cars").get();
    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const cars = await Promise.all(
      carsSnapshot.docs.map(async (doc) => {
        const carData = doc.data();
        const createdAt = carData.createdAt?.toDate?.() || null;

        // Auto-expire Featured Ads after 7 days
        if (
          carData.FeaturedAds === "Featured Ads" &&
          createdAt &&
          now - createdAt.getTime() > ONE_WEEK_MS
        ) {
          await db.collection("Cars").doc(doc.id).update({
            FeaturedAds: "Not Featured Ads",
            featuredAt: null,
          });

          carData.FeaturedAds = "Not Featured Ads";
          carData.featuredAt = null;
        }

        return {
          id: doc.id,
          ...carData,
        };
      })
    );

    // Filter only inactive cars
    const inactiveCars = cars.filter((car) => {
      const isActive = car.isActive;
      return isActive !== true && isActive !== "true";
    });

    let filteredCars = inactiveCars;

    // 🔍 Filter by searchText
    if (searchText) {
      filteredCars = filteredCars.filter((car) => {
        const titleMatch = car.title?.toLowerCase().includes(searchText);
        const subCategoriesMatch = Array.isArray(car.subCategories)
          ? car.subCategories.some((cat) =>
              cat.toLowerCase().includes(searchText)
            )
          : false;
        return titleMatch || subCategoriesMatch;
      });
    }

    // ✅ Filter by regionId
    if (regionId) {
      filteredCars = filteredCars.filter(
        (car) => String(car.regionId) === String(regionId)
      );
    }

    // ✅ Filter by CITY_ID
    if (CITY_ID) {
      filteredCars = filteredCars.filter(
        (car) => String(car.CITY_ID) === String(CITY_ID)
      );
    }

    // ✅ Filter by DISTRICT_ID
    if (DISTRICT_ID) {
      filteredCars = filteredCars.filter(
        (car) => String(car.District_ID) === String(DISTRICT_ID)
      );
    }

    // ✅ Sort: Featured Ads first, then by createdAt descending
    filteredCars.sort((a, b) => {
      const aIsFeatured = a.FeaturedAds === "Featured Ads" ? 1 : 0;
      const bIsFeatured = b.FeaturedAds === "Featured Ads" ? 1 : 0;

      if (aIsFeatured !== bIsFeatured) {
        return bIsFeatured - aIsFeatured;
      }

      const aTime = a.createdAt?._seconds || 0;
      const bTime = b.createdAt?._seconds || 0;
      return bTime - aTime;
    });

    // return res.status(200).json(filteredCars);
    return res.status(200).json(filteredCars.slice(0, 10));
  } catch (error) {
    console.error("Error fetching cars:", error);
    return res.status(500).json({ error: "Error fetching cars" });
  }
});
router.get("/ELECTRONICSCarousal", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const regionId = req.query.regionId;
    const CITY_ID = req.query.CITY_ID;
    const DISTRICT_ID = req.query.DISTRICT_ID;

    const snapshot = await db.collection("ELECTRONICS").get();
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

    // ✅ Filter by regionId
    if (regionId) {
      filtered = filtered.filter(
        (item) => String(item.regionId) === String(regionId)
      );
    }

    // ✅ Filter by CITY_ID
    if (CITY_ID) {
      filtered = filtered.filter(
        (item) => String(item.CITY_ID) === String(CITY_ID)
      );
    }

    // ✅ Filter by DISTRICT_ID
    if (DISTRICT_ID) {
      filtered = filtered.filter(
        (item) => String(item.District_ID) === String(DISTRICT_ID)
      );
    }

    // ✅ Sort: Featured Ads first, then newest
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

    return res.status(200).json(filtered.slice(0, 10));
  } catch (error) {
    console.error("Error fetching ELECTRONICS:", error);
    return res.status(500).json({ error: "Error fetching ELECTRONICS" });
  }
});
router.get("/FASHIONCarousal", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const regionId = req.query.regionId;
    const CITY_ID = req.query.CITY_ID;
    const DISTRICT_ID = req.query.DISTRICT_ID;

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

    // ✅ Filter by regionId
    if (regionId) {
      filtered = filtered.filter(
        (item) => String(item.regionId) === String(regionId)
      );
    }

    // ✅ Filter by CITY_ID
    if (CITY_ID) {
      filtered = filtered.filter(
        (item) => String(item.CITY_ID) === String(CITY_ID)
      );
    }

    // ✅ Filter by DISTRICT_ID
    if (DISTRICT_ID) {
      filtered = filtered.filter(
        (item) => String(item.District_ID) === String(DISTRICT_ID)
      );
    }

    // ✅ Sort: Featured Ads first, then newest
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

    return res.status(200).json(filtered.slice(0, 10));
  } catch (error) {
    console.error("Error fetching FASHION:", error);
    return res.status(500).json({ error: "Error fetching FASHION" });
  }
});

router.get("/HEALTHCARECarousal", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const regionId = req.query.regionId;
    const CITY_ID = req.query.CITY_ID;
    const DISTRICT_ID = req.query.DISTRICT_ID;

    const snapshot = await db.collection("HEALTHCARE").get();
    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const data = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const docData = doc.data();
        const featuredAt = docData.createdAt?.toDate?.() || null;

        if (
          docData.FeaturedAds === "Featured Ads" &&
          featuredAt &&
          now - featuredAt.getTime() > ONE_WEEK_MS
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

    const inactiveData = data.filter((item) => {
      const isActive = item.isActive;
      return isActive !== true && isActive !== "true";
    });

    let filtered = inactiveData;

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

    return res.status(200).json(filtered.slice(0, 10));
  } catch (error) {
    console.error("Error fetching HEALTHCARE:", error);
    return res.status(500).json({ error: "Error fetching HEALTHCARE" });
  }
});
router.get("/JOBBOARDCarousal", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const regionId = req.query.regionId;
    const CITY_ID = req.query.CITY_ID;
    const DISTRICT_ID = req.query.DISTRICT_ID;

    const snapshot = await db.collection("JOBBOARD").get();
    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const data = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const docData = doc.data();
        const featuredAt = docData.createdAt?.toDate?.() || null;

        if (
          docData.FeaturedAds === "Featured Ads" &&
          featuredAt &&
          now - featuredAt.getTime() > ONE_WEEK_MS
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

    const inactiveData = data.filter((item) => {
      const isActive = item.isActive;
      return isActive !== true && isActive !== "true";
    });

    let filtered = inactiveData;

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

    return res.status(200).json(filtered.slice(0, 10));
  } catch (error) {
    console.error("Error fetching JOBBOARD:", error);
    return res.status(500).json({ error: "Error fetching JOBBOARD" });
  }
});
router.get("/REALESTATECOMPCarousal", async (req, res) => {
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

    const inactiveData = data.filter((item) => {
      const isActive = item.isActive;
      return isActive !== true && isActive !== "true";
    });

    let filtered = inactiveData;

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

    return res.status(200).json(filtered.slice(0, 10));
  } catch (error) {
    console.error("Error fetching REALESTATECOMP:", error);
    return res.status(500).json({ error: "Error fetching REALESTATECOMP" });
  }
});
router.get("/TRAVELCarousal", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const regionId = req.query.regionId;
    const CITY_ID = req.query.CITY_ID;
    const DISTRICT_ID = req.query.DISTRICT_ID;

    const snapshot = await db.collection("TRAVEL").get();
    const now = Date.now();
    // const ONE_MINUTE_MS = 1 * 60 * 1000;
    const ONE_MINUTE_MS = 7 * 24 * 60 * 60 * 1000;

    const data = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const docData = doc.data();
        const featuredAt = docData.createdAt?.toDate?.() || null;

        // ✅ Auto-expire if 1 minute has passed since featuredAt
        if (
          docData.FeaturedAds === "Featured Ads" &&
          featuredAt &&
          now - featuredAt.getTime() > ONE_MINUTE_MS
        ) {
          // Update Firestore document
          await db.collection("TRAVEL").doc(doc.id).update({
            FeaturedAds: "Not Featured Ads",
            featuredAt: null,
          });

          // Update locally
          docData.FeaturedAds = "Not Featured Ads";
          docData.featuredAt = null;
        }

        return {
          id: doc.id,
          ...docData,
        };
      })
    );

    const inactiveData = data.filter((item) => {
      const isActive = item.isActive;
      return isActive !== true && isActive !== "true";
    });

    let filtered = inactiveData;

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

    return res.status(200).json(filtered.slice(0, 10));
  } catch (error) {
    console.error("Error fetching TRAVEL:", error);
    return res.status(500).json({ error: "Error fetching TRAVEL" });
  }
});
router.get("/SPORTSGAMESCompCarousal", async (req, res) => {
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

    const inactiveData = data.filter((item) => {
      const isActive = item.isActive;
      return isActive !== true && isActive !== "true";
    });

    let filtered = inactiveData;

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

    return res.status(200).json(filtered.slice(0, 10));
  } catch (error) {
    console.error("Error fetching SPORTSGAMESComp:", error);
    return res.status(500).json({ error: "Error fetching SPORTSGAMESComp" });
  }
});
router.get("/PETANIMALCOMPCarousal", async (req, res) => {
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

    // ✅ Filter by regionId
    if (regionId) {
      filtered = filtered.filter(
        (item) => String(item.regionId) === String(regionId)
      );
    }

    // ✅ Filter by CITY_ID
    if (CITY_ID) {
      filtered = filtered.filter(
        (item) => String(item.CITY_ID) === String(CITY_ID)
      );
    }

    // ✅ Filter by DISTRICT_ID
    if (DISTRICT_ID) {
      filtered = filtered.filter(
        (item) => String(item.District_ID) === String(DISTRICT_ID)
      );
    }

    // ✅ Sort: Featured Ads first, then by createdAt descending (newest first)
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

    return res.status(200).json(filtered.slice(0, 10));
  } catch (error) {
    console.error("Error fetching PETANIMALCOMP:", error);
    return res.status(500).json({ error: "Error fetching PETANIMALCOMP" });
  }
});
// Verify OTP
router.post("/verify-otp", async (req, res) => {
  const { phone, code } = req.body;

  if (!phone || !code) {
    return res
      .status(400)
      .json({ success: false, message: "Phone and OTP code are required" });
  }

  try {
    const response = await axios.post(
      `https://verify.twilio.com/v2/Services/${TWILIO_SERVICE_SID}/VerificationCheck`,
      new URLSearchParams({
        To: phone,
        Code: code,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(
            `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`
          ).toString("base64")}`,
        },
      }
    );

    if (response.data.status === "approved") {
      res.json({ success: true, message: "OTP verified" });
    } else {
      res.status(400).json({ success: false, message: "Invalid OTP" });
    }
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res
      .status(500)
      .json({ success: false, message: "Error verifying OTP", error });
  }
});
FB.options({ version: "v13.0" });

// Add this route below your existing routes
app.post("/api/share/facebook", async (req, res) => {
  try {
    const { itemId, itemName, itemPrice, itemImage, itemUrl } = req.body;

    // Set access token
    FB.setAccessToken(process.env.FACEBOOK_ACCESS_TOKEN);

    // Create post data
    const postData = {
      message: `Check out ${itemName} for $${itemPrice}`,
      picture: itemImage,
      link: itemUrl,
      name: itemName,
      description: `Shared from our store`,
      properties: {
        Price: `$${itemPrice}`,
      },
    };

    // Post to Facebook
    const response = await FB.api("/me/feed", "POST", postData);

    res.status(200).json({ success: true, postId: response.id });
  } catch (error) {
    console.error("Error posting to Facebook:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      facebookErrorCode: error.code,
    });
  }
});
module.exports = router;
