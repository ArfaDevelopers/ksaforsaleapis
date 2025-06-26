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
// router.get("/cars", async (req, res) => {
//   try {
//     const searchText = req.query.searchText?.toLowerCase();
//     const regionId = req.query.regionId;
//     const CITY_ID = req.query.CITY_ID;
//     const DISTRICT_ID = req.query.DISTRICT_ID;

//     const carsSnapshot = await db.collection("Cars").get();
//     const cars = carsSnapshot.docs
//       .map((doc) => ({
//         id: doc.id,
//         ...doc.data(),
//       }))
//       .filter((car) => {
//         const isActive = car.isActive;
//         return isActive !== true && isActive !== "true"; // exclude only active cars
//       });

//     let filteredCars = cars;

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

//     return res.status(200).json(filteredCars);
//   } catch (error) {
//     console.error("Error fetching cars:", error);
//     return res.status(500).json({ error: "Error fetching cars" });
//   }
// });

// router.get("/cars", async (req, res) => {
//   try {
//     const searchText = req.query.searchText?.toLowerCase(); // optional chaining and lowercase for case-insensitive comparison

//     const carsSnapshot = await db.collection("Cars").get();
//     const cars = carsSnapshot.docs
//       .map((doc) => ({
//         id: doc.id,
//         ...doc.data(),
//       }))
//       .filter((car) => {
//         const isActive = car.isActive;
//         return isActive !== true && isActive !== "true"; // exclude only active cars
//       });

//     // If searchText is present, filter based on title or subCategories
//     const filteredCars = searchText
//       ? cars.filter((car) => {
//           const titleMatch = car.title?.toLowerCase().includes(searchText);
//           const subCategoriesMatch = Array.isArray(car.subCategories)
//             ? car.subCategories.some((cat) =>
//                 cat.toLowerCase().includes(searchText)
//               )
//             : false;
//           return titleMatch || subCategoriesMatch;
//         })
//       : cars;

//     return res.status(200).json(filteredCars);
//   } catch (error) {
//     console.error("Error fetching cars:", error);
//     return res.status(500).json({ error: "Error fetching cars" });
//   }
// });
router.get("/cars", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const regionId = req.query.regionId;
    const CITY_ID = req.query.CITY_ID;
    const DISTRICT_ID = req.query.DISTRICT_ID;

    const carsSnapshot = await db.collection("Cars").get();
    const cars = carsSnapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter((car) => {
        const isActive = car.isActive;
        return isActive !== true && isActive !== "true"; // exclude only active cars
      });

    let filteredCars = cars;

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

    // ✅ Sort: Featured Ads first, then by createdAt ascending
    filteredCars.sort((a, b) => {
      const aIsFeatured = a.FeaturedAds === "Featured Ads" ? 1 : 0;
      const bIsFeatured = b.FeaturedAds === "Featured Ads" ? 1 : 0;

      if (aIsFeatured !== bIsFeatured) {
        return bIsFeatured - aIsFeatured; // Featured Ads first
      }

      const aTime = a.createdAt?._seconds || 0;
      const bTime = b.createdAt?._seconds || 0;
      return aTime - bTime; // Ascending order
    });

    return res.status(200).json(filteredCars);
  } catch (error) {
    console.error("Error fetching cars:", error);
    return res.status(500).json({ error: "Error fetching cars" });
  }
});

router.get("/PETANIMALCOMP", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const regionId = req.query.regionId;
    const CITY_ID = req.query.CITY_ID;
    const DISTRICT_ID = req.query.DISTRICT_ID;

    const snapshot = await db.collection("PETANIMALCOMP").get();

    const data = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter((item) => {
        const isActive = item.isActive;
        return isActive !== true && isActive !== "true"; // only inactive
      });

    let filtered = data;

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

    return res.status(200).json(filtered);
  } catch (error) {
    console.error("Error fetching PETANIMALCOMP:", error);
    return res.status(500).json({ error: "Error fetching PETANIMALCOMP" });
  }
});

router.get("/ELECTRONICS", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const regionId = req.query.regionId;
    const CITY_ID = req.query.CITY_ID;
    const DISTRICT_ID = req.query.DISTRICT_ID;

    const snapshot = await db.collection("ELECTRONICS").get();

    const electronics = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter((item) => {
        const isActive = item.isActive;
        return isActive !== true && isActive !== "true";
      });

    let filtered = electronics;

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
    const regionId = req.query.regionId;
    const CITY_ID = req.query.CITY_ID;
    const DISTRICT_ID = req.query.DISTRICT_ID;

    const snapshot = await db.collection("REALESTATECOMP").get();

    const data = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter((item) => {
        const isActive = item.isActive;
        return isActive !== true && isActive !== "true"; // exclude active items
      });

    let filtered = data;

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

    return res.status(200).json(filtered);
  } catch (error) {
    console.error("Error fetching REALESTATECOMP:", error);
    return res.status(500).json({ error: "Error fetching REALESTATECOMP" });
  }
});

router.get("/JOBBOARD", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const regionId = req.query.regionId;
    const CITY_ID = req.query.CITY_ID;
    const DISTRICT_ID = req.query.DISTRICT_ID;

    const snapshot = await db.collection("JOBBOARD").get();

    const jobBoardItems = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter((item) => {
        const isActive = item.isActive;
        return isActive !== true && isActive !== "true"; // only inactive items
      });

    let filtered = jobBoardItems;

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

    return res.status(200).json(filtered);
  } catch (error) {
    console.error("Error fetching JOBBOARD:", error);
    return res.status(500).json({ error: "Error fetching JOBBOARD" });
  }
});

router.get("/FASHION", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const regionId = req.query.regionId;
    const CITY_ID = req.query.CITY_ID;
    const DISTRICT_ID = req.query.DISTRICT_ID;

    const snapshot = await db.collection("FASHION").get();

    const fashionItems = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter((item) => {
        const isActive = item.isActive;
        return isActive !== true && isActive !== "true"; // only inactive
      });

    let filtered = fashionItems;

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

    return res.status(200).json(filtered);
  } catch (error) {
    console.error("Error fetching FASHION:", error);
    return res.status(500).json({ error: "Error fetching FASHION" });
  }
});

router.get("/HEALTHCARE", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const regionId = req.query.regionId;
    const CITY_ID = req.query.CITY_ID;
    const DISTRICT_ID = req.query.DISTRICT_ID;

    const snapshot = await db.collection("HEALTHCARE").get();

    const healthcareItems = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter((item) => {
        const isActive = item.isActive;
        return isActive !== true && isActive !== "true"; // only inactive
      });

    let filtered = healthcareItems;

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

    return res.status(200).json(filtered);
  } catch (error) {
    console.error("Error fetching HEALTHCARE:", error);
    return res.status(500).json({ error: "Error fetching HEALTHCARE" });
  }
});

router.get("/TRAVEL", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const regionId = req.query.regionId;
    const CITY_ID = req.query.CITY_ID;
    const DISTRICT_ID = req.query.DISTRICT_ID;

    const snapshot = await db.collection("TRAVEL").get();

    const data = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter((item) => {
        const isActive = item.isActive;
        return isActive !== true && isActive !== "true";
      });

    let filtered = data;

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

    return res.status(200).json(filtered);
  } catch (error) {
    console.error("Error fetching TRAVEL:", error);
    return res.status(500).json({ error: "Error fetching TRAVEL" });
  }
});

// router.get("/TRAVEL", async (_, res) => {
//   try {
//     const TRAVELSnapshot = await db.collection("TRAVEL").get();
//     const TRAVEL = TRAVELSnapshot.docs
//       .map((doc) => ({
//         id: doc.id,
//         ...doc.data(),
//       }))
//       .filter((car) => {
//         const isActive = car.isActive;
//         return isActive !== true && isActive !== "true"; // exclude only true or "true"
//       });

//     return res.status(200).json(TRAVEL);
//   } catch (error) {
//     console.error("Error fetching TRAVEL:", error);
//     return res.status(500).json({ error: "Error fetching TRAVEL" });
//   }
// });
router.get("/SPORTSGAMESComp", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const regionId = req.query.regionId;
    const CITY_ID = req.query.CITY_ID;
    const DISTRICT_ID = req.query.DISTRICT_ID;

    const snapshot = await db.collection("SPORTSGAMESComp").get();

    const data = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter((item) => {
        const isActive = item.isActive;
        return isActive !== true && isActive !== "true"; // Exclude active items
      });

    let filtered = data;

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

    return res.status(200).json(filtered);
  } catch (error) {
    console.error("Error fetching SPORTSGAMESComp:", error);
    return res.status(500).json({ error: "Error fetching SPORTSGAMESComp" });
  }
});

router.get("/Education", async (req, res) => {
  try {
    const searchText = req.query.searchText?.toLowerCase();
    const regionId = req.query.regionId;
    const CITY_ID = req.query.CITY_ID;
    const DISTRICT_ID = req.query.DISTRICT_ID;

    const EducationSnapshot = await db.collection("Education").get();

    const Education = EducationSnapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter((item) => {
        const isActive = item.isActive;
        return isActive !== true && isActive !== "true";
      });

    let filtered = Education;

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

    return res.status(200).json(filtered);
  } catch (error) {
    console.error("Error fetching Education:", error);
    return res.status(500).json({ error: "Error fetching Education" });
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

module.exports = router;
