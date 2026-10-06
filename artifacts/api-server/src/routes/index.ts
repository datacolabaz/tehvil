import { Router, type IRouter } from "express";
import healthRouter from "./health";
import requireAuth from "../middlewares/requireAuth";
import activityRouter from "./activity";
import changesRouter from "./changes";
import milestonesRouter from "./milestones";
import paymentsRouter from "./payments";
import projectsRouter from "./projects";
import scopeRouter from "./scope";
import storageRouter from "./storage";
import lifecycleRouter from "./projectLifecycle";
import sharedEstimatesRouter from "./sharedEstimates";
import smetaRouter from "./smeta";
import contractorRouter from "./contractor";
import publicContractorRouter from "./publicContractor";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sharedEstimatesRouter);
router.use(publicContractorRouter);
router.use(storageRouter);
router.use(lifecycleRouter);
router.use(requireAuth);
router.use(projectsRouter);
router.use(scopeRouter);
router.use(changesRouter);
router.use(milestonesRouter);
router.use(paymentsRouter);
router.use(activityRouter);
router.use(smetaRouter);
router.use(contractorRouter);

export default router;
