import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import subdomainsRouter from "./subdomains.js";
import tlsRouter from "./tls.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(subdomainsRouter);
router.use(tlsRouter);

export default router;
