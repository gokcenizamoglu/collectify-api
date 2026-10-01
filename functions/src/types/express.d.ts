// Declaration merging: attach the authenticated user to Express's Request so
// controllers can read req.user without casts. Populated by the authenticate
// middleware; optional because it is absent on public routes (e.g. /health).
declare global {
  namespace Express {
    interface Request {
      user?: { uid: string };
    }
  }
}

export {};
