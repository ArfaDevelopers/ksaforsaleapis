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
const TWILIO_SERVICE_SID = "VA11fde75371f7e79949bcf4c1e6cb8fef";

const TWILIO_ACCOUNT_SID = "AC1889f1661cd9d55526ddbf75143ca9a2";
const TWILIO_AUTH_TOKEN = "3646885bb5e2f2adb574680251d84de5";
// Generate Access Token for User
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

// Fetch all cars from Firestore
router.get("/cars", async (_, res) => {
  try {
    const carsSnapshot = await db.collection("Cars").get();
    const cars = carsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).json(cars);
  } catch (error) {
    console.error("Error fetching cars:", error);
    return res.status(500).json({ error: "Error fetching cars" });
  }
});

// Send OTP
router.post("/send-otp", async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res
      .status(400)
      .json({ success: false, message: "Phone number is required" });
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
    console.error("Error sending OTP:", error);
    res
      .status(500)
      .json({ success: false, message: "Error sending OTP", error });
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
