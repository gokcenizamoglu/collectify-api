import { RequestHandler } from "express";

// Record a low-cardinality route template on res.locals while the route is
// matched (req.route/req.params are only populated here, not at the app-level
// "finish" where the access log runs — Express restores req.params when leaving
// a sub-router). `base` is the mount prefix of the router (its param names kept
// as :name), to which we append the matched leaf pattern (req.route.path).
export function tagRoute(base: string): RequestHandler {
  return (req, res, next) => {
    const leaf = req.route && req.route.path !== "/" ? req.route.path : "";
    res.locals.routeTemplate = `${base}${leaf}`;
    next();
  };
}
