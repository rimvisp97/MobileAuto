import { Router, type IRouter } from "express";
import healthRouter from "./health";
import partsRouter from "./parts";
import donorsRouter from "./donors";
import settingsRouter from "./settings";
import vehiclesRouter from "./vehicles";

const router: IRouter = Router();

router.use(healthRouter);
router.use(partsRouter);
router.use(vehiclesRouter);
router.use(donorsRouter);
router.use(settingsRouter);

export default router;
