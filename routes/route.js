const { db } = require("../firebase/config");

const router = require("express").Router();

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

module.exports = router;
