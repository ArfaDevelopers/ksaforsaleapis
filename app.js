const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const compression = require("compression");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(compression());

app.get("/", (_, res) => {
  return res.send("<a href='/route'>Click to redirect to /route</a>");
});

app.use("/route", require("./routes/route")); // Includes Twilio OTP + Firestore Cars

const PORT = process.env.PORT || 9002;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

module.exports = app;
