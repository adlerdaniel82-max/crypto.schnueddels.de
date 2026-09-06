"use strict";

const settingsRepository = require("../repositories/settings.repository");

async function listSettings(req, res, next) {
  try {
    const items = await settingsRepository.listAllActiveSettings();
    res.json({ items });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listSettings
};
