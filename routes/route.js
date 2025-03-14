const { db } = require("../firebase/config");
const express = require("express");
const router = express.Router();
const twilio = require("twilio");

const axios = require("axios");
require("dotenv").config();

// Twilio Credentials (Ensure these are securely stored, not hardcoded)
// const TWILIO_SERVICE_SID = process.env.TWILIO_SERVICE_SID;
const TWILIO_SERVICE_SID = "VA51beac2a0c74d6cb4c150799d00ee491";

const TWILIO_ACCOUNT_SID = "AC10ecc49693f7d3f967529681877e661f";
const TWILIO_AUTH_TOKEN = "b1b5ec56e8255b53aeb5d7a0e4c5ff8b";
// Generate Access Token for User
const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

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
