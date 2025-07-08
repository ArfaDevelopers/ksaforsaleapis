const express = require("express");
const router = express.Router();
const { db } = require("../firebase/config"); // using your db config
// router.get("/fetchCars", async (req, res) => {
//   try {
//     const {
//       searchQuery = "",
//       id: userId = "",
//       sortOrder = "Newest",
//       page = 1,
//       limit = 5,
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

//     const filteredData = searchQuery
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

//     const sortedData = filteredData.sort((a, b) => {
//       const dateA = a.createdAt?._seconds || 0;
//       const dateB = b.createdAt?._seconds || 0;
//       return sortOrder === "Oldest" ? dateA - dateB : dateB - dateA;
//     });

//     const total = sortedData.length;
//     const pageInt = parseInt(page);
//     const limitInt = parseInt(limit);
//     const startIndex = (pageInt - 1) * limitInt;
//     const paginated = sortedData.slice(startIndex, startIndex + limitInt);

//     return res.status(200).json({
//       success: true,
//       message: "Listings fetched successfully.",
//       data: paginated,
//       total,
//       totalPages: Math.ceil(total / limitInt),
//       currentPage: pageInt,
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
router.get("/fetchCars", async (req, res) => {
  try {
    const {
      searchText = "",
      id: userId = "",
      regionId = "",
      CITY_ID = "",
      DISTRICT_ID = "",
      sortOrder = "Newest",
      page = 1,
      limit = 10,
    } = req.query;

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

    const now = Date.now();
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const fetchPromises = COLLECTIONS.map(async (collectionName) => {
      let query = db.collection(collectionName);
      if (userId) {
        query = query.where("userId", "==", userId);
      }

      const snapshot = await query.get();

      return Promise.all(
        snapshot.docs.map(async (doc) => {
          const data = doc.data();
          const createdAt = data.createdAt?.toDate?.() || null;

          // Auto-expire Featured Ads
          if (
            data.FeaturedAds === "Featured Ads" &&
            createdAt &&
            now - createdAt.getTime() > ONE_WEEK_MS
          ) {
            await db.collection(collectionName).doc(doc.id).update({
              FeaturedAds: "Not Featured Ads",
              featuredAt: null,
            });
            data.FeaturedAds = "Not Featured Ads";
            data.featuredAt = null;
          }

          return {
            id: doc.id,
            ...data,
            _collection: collectionName,
          };
        })
      );
    });

    const results = await Promise.all(fetchPromises);
    let allData = results.flat();

    // ✅ Only show inactive
    allData = allData.filter(
      (item) => item.isActive !== true && item.isActive !== "true"
    );

    // ✅ Filter by searchText
    if (searchText) {
      allData = allData.filter((item) => {
        const titleMatch = item.title
          ?.toLowerCase()
          .includes(searchText.toLowerCase());
        const subCategoriesMatch = Array.isArray(item.subCategories)
          ? item.subCategories.some((cat) =>
              cat.toLowerCase().includes(searchText.toLowerCase())
            )
          : false;
        return titleMatch || subCategoriesMatch;
      });
    }

    // ✅ Filter by regionId
    if (regionId) {
      allData = allData.filter(
        (item) => String(item.regionId) === String(regionId)
      );
    }

    // ✅ Filter by CITY_ID
    if (CITY_ID) {
      allData = allData.filter(
        (item) => String(item.CITY_ID) === String(CITY_ID)
      );
    }

    // ✅ Filter by DISTRICT_ID
    if (DISTRICT_ID) {
      allData = allData.filter(
        (item) => String(item.District_ID) === String(DISTRICT_ID)
      );
    }

    // ✅ Sort: Featured Ads first, then by createdAt
    allData.sort((a, b) => {
      const aFeatured = a.FeaturedAds === "Featured Ads" ? 1 : 0;
      const bFeatured = b.FeaturedAds === "Featured Ads" ? 1 : 0;
      if (aFeatured !== bFeatured) return bFeatured - aFeatured;

      const aTime = a.createdAt?._seconds || 0;
      const bTime = b.createdAt?._seconds || 0;
      return sortOrder === "Oldest" ? aTime - bTime : bTime - aTime;
    });

    // ✅ Pagination
    const pageInt = parseInt(page);
    const limitInt = parseInt(limit);
    const startIndex = (pageInt - 1) * limitInt;
    const paginated = allData.slice(startIndex, startIndex + limitInt);

    return res.status(200).json({
      success: true,
      message: "Filtered listings fetched successfully.",
      data: paginated,
      total: allData.length,
      totalPages: Math.ceil(allData.length / limitInt),
      currentPage: pageInt,
    });
  } catch (error) {
    console.error("Error fetching listings:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

module.exports = router;
