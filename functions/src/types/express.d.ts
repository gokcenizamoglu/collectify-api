// Declaration merging: attach per-request fields to Express's Request.
// - user: the authenticated principal (set by authenticate; absent on public routes)
// - requestId: correlation id set by requestContext (present on every request)
declare global {
  namespace Express {
    interface Request {
      user?: { uid: string };
      requestId?: string;
    }
  }
}

export {};
