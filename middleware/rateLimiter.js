const rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: { error: "Too many attempts. Please try again in a few minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  // Required behind Render / any reverse proxy – avoid ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
  validate: { xForwardedForHeader: false },
});

module.exports = { authLimiter };
