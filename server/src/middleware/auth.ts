import { createMiddleware } from "hono/factory";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret-change-me");

export const requireAuth = createMiddleware<{ Variables: { userId: string } }>(
  async (c, next) => {
    const cookie = c.req.header("cookie") ?? "";
    const match = cookie.match(/(?:^|;\s*)token=([^;]+)/);
    if (!match) return c.json({ error: "Unauthorized" }, 401);

    try {
      const { payload } = await jwtVerify(match[1], secret);
      if (typeof payload.sub !== "string") throw new Error("bad sub");
      c.set("userId", payload.sub);
      await next();
    } catch {
      return c.json({ error: "Unauthorized" }, 401);
    }
  }
);
