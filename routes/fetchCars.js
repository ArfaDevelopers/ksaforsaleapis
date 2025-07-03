const express = require("express");
const router = express.Router();
const { db } = require("../firebase/config"); // using your db config
router.get("/fetchCars", async (req, res) => {
  try {
    const {
      searchQuery = "",
      id: userId = "",
      sortOrder = "Newest",
      page = 1,
      limit = 5,
    } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Missing userId in query params.",
        data: [],
      });
    }

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
        .get();

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        isActive: doc.data().isActive ?? false,
        _collection: collectionName,
      }));
    });

    const results = await Promise.all(fetchPromises);
    const allData = results.flat();

    if (allData.length === 0) {
      return res.status(200).json({
        success: false,
        message: "This user has no listings.",
        data: [],
      });
    }

    const filteredData = searchQuery
      ? allData.filter(
          (item) =>
            (item.title?.toLowerCase() || "").includes(
              searchQuery.toLowerCase()
            ) ||
            (item.description?.toLowerCase() || "").includes(
              searchQuery.toLowerCase()
            )
        )
      : allData;

    const sortedData = filteredData.sort((a, b) => {
      const dateA = a.createdAt?._seconds || 0;
      const dateB = b.createdAt?._seconds || 0;
      return sortOrder === "Oldest" ? dateA - dateB : dateB - dateA;
    });

    const total = sortedData.length;
    const pageInt = parseInt(page);
    const limitInt = parseInt(limit);
    const startIndex = (pageInt - 1) * limitInt;
    const paginated = sortedData.slice(startIndex, startIndex + limitInt);

    return res.status(200).json({
      success: true,
      message: "Listings fetched successfully.",
      data: paginated,
      total,
      totalPages: Math.ceil(total / limitInt),
      currentPage: pageInt,
    });
  } catch (error) {
    console.error("Error fetching listings:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

// router.get("/fetchCars", async (req, res) => {
//   try {
//     const {
//       searchQuery = "",
//       id: userId = "",
//       sortOrder = "Newest",
//     } = req.query;

//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing userId in query params.",
//         data: [],
//       });
//     }

//     const COLLECTIONS = [
//       "SPORTSGAMESComp",
//       "REALESTATECOMP",
//       "Cars",
//       "ELECTRONICS",
//       "Education",
//       "FASHION",
//       "HEALTHCARE",
//       "JOBBOARD",
//       "MAGAZINESCOMP",
//       "PETANIMALCOMP",
//       "TRAVEL",
//     ];

//     const fetchPromises = COLLECTIONS.map(async (collectionName) => {
//       const snapshot = await db
//         .collection(collectionName)
//         .where("userId", "==", userId)
//         .get();

//       return snapshot.docs.map((doc) => ({
//         id: doc.id,
//         ...doc.data(),
//         isActive: doc.data().isActive ?? false,
//         _collection: collectionName,
//       }));
//     });

//     const results = await Promise.all(fetchPromises);
//     const allData = results.flat();

//     if (allData.length === 0) {
//       return res.status(200).json({
//         success: false,
//         message: "This user has no listings.",
//         data: [],
//       });
//     }

//     // Filter by search query
//     const searchedData = searchQuery
//       ? allData.filter(
//           (item) =>
//             (item.title?.toLowerCase() || "").includes(
//               searchQuery.toLowerCase()
//             ) ||
//             (item.description?.toLowerCase() || "").includes(
//               searchQuery.toLowerCase()
//             )
//         )
//       : allData;

//     // Sort by createdAt timestamp
//     const sortedData = searchedData.sort((a, b) => {
//       const dateA = a.createdAt?._seconds || 0;
//       const dateB = b.createdAt?._seconds || 0;
//       return sortOrder === "Oldest" ? dateA - dateB : dateB - dateA;
//     });

//     res.status(200).json({
//       success: true,
//       message: "Listings fetched successfully.",
//       data: sortedData,
//     });
//   } catch (error) {
//     console.error("Error fetching listings:", error);
//     res.status(500).json({
//       success: false,
//       message: "Internal Server Error",
//       error: error.message,
//     });
//   }
// });

module.exports = router;
