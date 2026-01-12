import { Router } from "express";
import crypto from "crypto";
import {
  clearAuthSessionImpersonation,
  clearAuthSessionsForUser,
  countUsers,
  createAuthSession,
  createUser,
  deleteUser,
  getUserByEmail,
  getUserById,
  getUserByUsername,
  listUsers,
  setAuthSessionImpersonation,
  updateUserPassword,
  updateUserProfile,
  updateUserRole,
  updateUserStatus
} from "../db.js";
import {
  attachAuth,
  clearSessionCookie,
  createSessionToken,
  getSessionExpiry,
  requireAdmin,
  requireAuth,
  setSessionCookie
} from "../auth.js";

const router = Router();

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(derived, "hex"));
}

function normalizeIdentity(value: string) {
  return value.trim();
}

function ensureBootstrapAdmin(): void {
  if (countUsers() > 0) return;
  const username = process.env.ADMIN_USERNAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD?.trim();
  if (!username || !email || !password) return;
  createUser(username, email, hashPassword(password), "admin", "active");
}

ensureBootstrapAdmin();

router.use(attachAuth);

router.post("/auth/register", (req, res) => {
  const { username, email, password } = req.body as { username?: string; email?: string; password?: string };
  if (!username || !email || !password) {
    return res.status(400).json({ error: "Provide username, email, and password." });
  }
  const normalizedUsername = normalizeIdentity(username);
  const normalizedEmail = normalizeIdentity(email);
  if (getUserByUsername(normalizedUsername)) {
    return res.status(409).json({ error: "Username already exists." });
  }
  if (getUserByEmail(normalizedEmail)) {
    return res.status(409).json({ error: "Email already exists." });
  }
  createUser(normalizedUsername, normalizedEmail, hashPassword(password), "user", "pending");
  res.status(201).json({ ok: true });
});

router.post("/auth/login", (req, res) => {
  const { identity, password } = req.body as { identity?: string; password?: string };
  if (!identity || !password) {
    return res.status(400).json({ error: "Provide username/email and password." });
  }
  const normalized = normalizeIdentity(identity);
  const user = getUserByUsername(normalized) || getUserByEmail(normalized);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: "Invalid credentials." });
  }
  if (user.status === "pending") {
    return res.status(403).json({ error: "Account pending approval.", code: "pending" });
  }
  if (user.status !== "active") {
    return res.status(403).json({ error: "Account disabled." });
  }
  const token = createSessionToken();
  const expiresAt = getSessionExpiry();
  createAuthSession(user.id, token, expiresAt, req.ip ?? null, req.headers["user-agent"] ?? null);
  setSessionCookie(res, token);
  res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status
    }
  });
});

router.post("/auth/logout", requireAuth, (req, res) => {
  clearAuthSessionsForUser(req.auth!.user.id);
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/auth/me", (req, res) => {
  if (!req.auth) return res.json({ user: null, impersonator: null });
  res.json({
    user: req.auth.effectiveUser,
    impersonator: req.auth.impersonatedBy
  });
});

router.get("/admin/users", requireAuth, requireAdmin, (req, res) => {
  res.json(listUsers());
});

router.post("/admin/users", requireAuth, requireAdmin, (req, res) => {
  const { username, email, password, role, status } = req.body as {
    username?: string;
    email?: string;
    password?: string;
    role?: "admin" | "user";
    status?: "pending" | "active" | "disabled";
  };
  if (!username || !email || !password) {
    return res.status(400).json({ error: "Provide username, email, and password." });
  }
  const normalizedUsername = normalizeIdentity(username);
  const normalizedEmail = normalizeIdentity(email);
  if (getUserByUsername(normalizedUsername)) {
    return res.status(409).json({ error: "Username already exists." });
  }
  if (getUserByEmail(normalizedEmail)) {
    return res.status(409).json({ error: "Email already exists." });
  }
  const user = createUser(
    normalizedUsername,
    normalizedEmail,
    hashPassword(password),
    role === "admin" ? "admin" : "user",
    status === "active" || status === "disabled" ? status : "pending"
  );
  res.status(201).json(user);
});

router.patch("/admin/users/:id", requireAuth, requireAdmin, (req, res) => {
  const userId = Number(req.params.id);
  const existing = getUserById(userId);
  if (!existing) return res.status(404).json({ error: "User not found." });
  const { username, email, password, role, status } = req.body as {
    username?: string;
    email?: string;
    password?: string;
    role?: "admin" | "user";
    status?: "pending" | "active" | "disabled";
  };
  if (username || email) {
    const nextUsername = username ? normalizeIdentity(username) : existing.username;
    const nextEmail = email ? normalizeIdentity(email) : existing.email;
    if (nextUsername !== existing.username && getUserByUsername(nextUsername)) {
      return res.status(409).json({ error: "Username already exists." });
    }
    if (nextEmail !== existing.email && getUserByEmail(nextEmail)) {
      return res.status(409).json({ error: "Email already exists." });
    }
    updateUserProfile(userId, nextUsername, nextEmail);
  }
  if (password) {
    updateUserPassword(userId, hashPassword(password));
  }
  if (role) {
    updateUserRole(userId, role === "admin" ? "admin" : "user");
  }
  if (status) {
    updateUserStatus(userId, status);
  }
  const updated = getUserById(userId);
  res.json(updated ? {
    id: updated.id,
    username: updated.username,
    email: updated.email,
    role: updated.role,
    status: updated.status,
    createdAt: updated.createdAt,
    approvedAt: updated.approvedAt,
    lastLoginAt: updated.lastLoginAt
  } : null);
});

router.delete("/admin/users/:id", requireAuth, requireAdmin, (req, res) => {
  const userId = Number(req.params.id);
  const existing = getUserById(userId);
  if (!existing) return res.status(404).json({ error: "User not found." });
  if (req.auth!.user.id === userId) {
    return res.status(400).json({ error: "Cannot delete your own account." });
  }
  deleteUser(userId);
  res.json({ ok: true });
});

router.post("/admin/users/:id/impersonate", requireAuth, requireAdmin, (req, res) => {
  const userId = Number(req.params.id);
  const target = getUserById(userId);
  if (!target) return res.status(404).json({ error: "User not found." });
  if (target.status !== "active") {
    return res.status(400).json({ error: "User must be active to impersonate." });
  }
  setAuthSessionImpersonation(req.auth!.sessionId, target.id, req.auth!.user.id);
  res.json({ ok: true });
});

router.post("/admin/impersonate/exit", requireAuth, requireAdmin, (req, res) => {
  clearAuthSessionImpersonation(req.auth!.sessionId);
  res.json({ ok: true });
});

export default router;
