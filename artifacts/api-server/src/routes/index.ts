import { Router, type IRouter } from "express";
import healthRouter from "./health";
import partsRouter from "./parts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(partsRouter);

export default router;
