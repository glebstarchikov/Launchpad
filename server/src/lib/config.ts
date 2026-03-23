export const jwtSecret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-secret-change-me"
);
