import express from "express";
import { requestContext } from "./middleware/requestContext";
import { healthRouter } from "./routes/health";
import { collectionsRouter } from "./routes/collections";
import { notFoundHandler } from "./middleware/notFound";
import { errorHandler } from "./middleware/errorHandler";

export const app = express();

// Don't advertise the framework.
app.disable("x-powered-by");

// First: assign/echo the request id and log one access line per request.
app.use(requestContext);

// Parse JSON bodies; cap size so oversized payloads are rejected early.
app.use(express.json({ limit: "100kb" }));

// Feature routers.
app.use(healthRouter);
app.use("/collections", collectionsRouter);

// Unmatched route -> standard 404 error shape.
app.use(notFoundHandler);

// Error handler is always last so every thrown/forwarded error lands here.
app.use(errorHandler);
