import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import {
  getAuthSessionByToken,
  getUserById,
  deleteAuthSession,
  updateUserLastLogin
} from "./db.js";

export const SESSION_COOKIE = "rl_session";
const SESSION_TTL_DAYS = 30;

export interface AuthContext {
  sessionId: number;
  user: {
    id: number;
    username: string;
    email: string;
    role: "admin" | "user";
    status: "pending" | "active" | "disabled";
  };
  effectiveUser: {
    id: number;
    username: string;
    email: string;
    role: "admin" | "user";
    status: "pending" | "active" | "disabled";
  };
  impersonatedBy: {
    id: number;
    username: string;
    email: string;
  } | null;
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return header.split(";").reduce((acc, part) => {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rest.join("="));
    return acc;
  }, {} as Record<string, string>);
}

export function createSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function getSessionExpiry(): string {
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_TTL_DAYS);
  return expires.toISOString();
}

export function setSessionCookie(res: Response, token: string) {
  const secure = process.env.NODE_ENV === "production";
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/"
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export async function attachAuth(req: Request, res: Response, next: NextFunction) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (!token) {
    return next();
  }
  const session = getAuthSessionByToken(token);
  if (!session) {
    clearSessionCookie(res);
    return next();
  }
  const expiresAt = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    deleteAuthSession(token);
    clearSessionCookie(res);
    return next();
  }
  const user = getUserById(session.userId);
  if (!user) {
    deleteAuthSession(token);
    clearSessionCookie(res);
    return next();
  }
  const impersonated = session.impersonatedUserId ? getUserById(session.impersonatedUserId) : null;
  const effective = impersonated ?? user;
  req.auth = {
    sessionId: session.id,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role as "admin" | "user",
      status: user.status as "pending" | "active" | "disabled"
    },
    effectiveUser: {
      id: effective.id,
      username: effective.username,
      email: effective.email,
      role: effective.role as "admin" | "user",
      status: effective.status as "pending" | "active" | "disabled"
    },
    impersonatedBy: impersonated
      ? { id: user.id, username: user.username, email: user.email }
      : null
  };
  updateUserLastLogin(user.id);
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (req.auth.effectiveUser.status === "pending") {
    return res.status(403).json({ error: "Account pending approval.", code: "pending" });
  }
  if (req.auth.effectiveUser.status !== "active") {
    return res.status(403).json({ error: "Account disabled." });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth || req.auth.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}
