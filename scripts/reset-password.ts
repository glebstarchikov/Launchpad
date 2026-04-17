import { Database } from "bun:sqlite";

const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.error("Usage: bun scripts/reset-password.ts <email> <new-password>");
  process.exit(1);
}

const db = new Database(process.env.DATABASE_PATH ?? "./launchpad.db");
const user = db.query("SELECT id FROM users WHERE email = ?").get(email) as { id: string } | null;

if (!user) {
  console.error(`No user found with email: ${email}`);
  process.exit(1);
}

const hash = await Bun.password.hash(newPassword);
db.run("UPDATE users SET password_hash = ?, updated_at = ? WHERE email = ?", [hash, Date.now(), email]);
console.log(`Password reset for ${email}`);
