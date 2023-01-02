import express, { Router } from "express";
import * as SegmentRouteHandler from "./segment-route-handler";
import {isValid, querySearch, paramMongoId, skipInt, limitInt} from "../../common/validator";

const router: Router = express.Router();

router
  .route("/")
  .get(querySearch, skipInt, limitInt, isValid, SegmentRouteHandler.segmentList);

router
  .route("/:id")
  .get(paramMongoId, isValid, SegmentRouteHandler.getSegmentById)
  .patch(paramMongoId, isValid, SegmentRouteHandler.updateSegmentById);

router
  .route("/gender-data/:id")
  .get(paramMongoId, isValid, SegmentRouteHandler.getSegmentGenderData);

export default router;
