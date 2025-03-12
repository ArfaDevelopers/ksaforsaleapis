const { db } = require("../firebase/config");
const express = require("express");
const router = express.Router();
const axios = require("axios");
require("dotenv").config();

// Twilio Credentials (Ensure these are securely stored, not hardcoded)
const TWILIO_SERVICE_SID = process.env.TWILIO_SERVICE_SID;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

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
