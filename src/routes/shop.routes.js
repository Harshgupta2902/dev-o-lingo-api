const router = require("express").Router();
const { getShopItems, createOrder, verifyPurchase } = require("../controller/shop.controller");
const auth = require("../middleware");

// Shop APIs
router.get("/shop/items", getShopItems);
router.post("/shop/orders", auth, createOrder);
router.post("/shop/verify", auth, verifyPurchase);

module.exports = router;
