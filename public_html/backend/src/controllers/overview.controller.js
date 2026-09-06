"use strict";

const overviewService = require("../services/overview.service");

async function getOverview(req, res, next) {
  try {
    const overview = await overviewService.getOverview();
    res.json(overview);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getOverview
};
