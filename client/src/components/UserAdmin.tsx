import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createUser, deleteUser, impersonateUser, listUsers, updateUser } from "../api";
import ThemeToggle from "./ThemeToggle";
import BuildInfo from "./BuildInfo";
import ImpersonationBanner from "./ImpersonationBanner";
import SignOutButton from "./SignOutButton";
import UserBadge from "./UserBadge";

type UserRow = {
  id: number;
  username: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  approvedAt: string | null;
  lastLoginAt: string | null;
};

export default function UserAdmin() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<UserRow & { password?: string }>>({});
  const [newUser, setNewUser] = useState({ username: "", email: "", password: "", role: "user", status: "active" });
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const data = await listUsers();
      setUsers(data as UserRow[]);
    } catch (err: any) {
      setError(err?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  function startEdit(user: UserRow) {
    setEditingId(user.id);
    setEditValues({
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status
    });
    setShowEditPassword(false);
  }

  async function saveEdit(userId: number) {
    try {
      await updateUser(userId, {
        username: editValues.username,
        email: editValues.email,
        role: editValues.role as "admin" | "user" | undefined,
        status: editValues.status as "pending" | "active" | "disabled" | undefined,
        password: editValues.password
      });
      setEditingId(null);
      setEditValues({});
      setShowEditPassword(false);
      await loadUsers();
    } catch (err: any) {
      setError(err?.message || "Failed to update user");
    }
  }

  async function handleDelete(userId: number) {
    if (!window.confirm("Delete this user and all associated data?")) return;
    try {
      await deleteUser(userId);
      await loadUsers();
    } catch (err: any) {
      setError(err?.message || "Failed to delete user");
    }
  }

  async function handleImpersonate(userId: number) {
    try {
      await impersonateUser(userId);
      navigate("/");
    } catch (err: any) {
      setError(err?.message || "Failed to impersonate user");
    }
  }

  async function handleCreate() {
    setError(null);
    try {
      await createUser({
        username: newUser.username.trim(),
        email: newUser.email.trim(),
        password: newUser.password,
        role: newUser.role as "admin" | "user",
        status: newUser.status as "pending" | "active" | "disabled"
      });
      setNewUser({ username: "", email: "", password: "", role: "user", status: "active" });
      setShowNewPassword(false);
      await loadUsers();
    } catch (err: any) {
      setError(err?.message || "Failed to create user");
    }
  }

  return (
    <div className="app">
      <ImpersonationBanner />
      <header className="header">
        <div className="banner">
          <Link to="/">
            <img className="banner-logo" src="/src/assets/logo.png" alt="Session logo" />
          </Link>
          <div className="banner-center">
            <div className="banner-title">User admin</div>
          </div>
          <div className="banner-actions">
            <UserBadge />
            <div className="banner-actions-row">
              <details className="menu">
                <summary aria-label="User admin menu">
                  <span className="burger">
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                </summary>
                <div className="menu-panel">
                  <ThemeToggle />
                  <Link className="menu-link" to="/admin">System admin</Link>
                  <SignOutButton />
                </div>
              </details>
          <button className="ghost" onClick={() => navigate("/sessions")}>Back</button>
            </div>
          </div>
        </div>
      </header>
      <main className="page-content">
        {error && <p className="error">{error}</p>}
        <section className="panel">
          <div className="section-header">
            <h2>User accounts</h2>
            <button className="ghost" onClick={loadUsers} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <div className="panel-grid">
            <div className="panel-block">
              <h3>Create user</h3>
              <div className="form">
                <label>
                  Username
                  <input
                    type="text"
                    autoComplete="off"
                    value={newUser.username}
                    onChange={(e) => setNewUser((prev) => ({ ...prev, username: e.target.value }))}
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    autoComplete="off"
                    value={newUser.email}
                    onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </label>
                <label>
                  Password
                  <input
                    type={showNewPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={newUser.password}
                    onChange={(e) => setNewUser((prev) => ({ ...prev, password: e.target.value }))}
                  />
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={showNewPassword}
                    onChange={(e) => setShowNewPassword(e.target.checked)}
                  />
                  Show password
                </label>
                <label>
                  Role
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser((prev) => ({ ...prev, role: e.target.value }))}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <label>
                  Status
                  <select
                    value={newUser.status}
                    onChange={(e) => setNewUser((prev) => ({ ...prev, status: e.target.value }))}
                  >
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </label>
                <div className="actions">
                  <button onClick={handleCreate}>Create user</button>
                </div>
              </div>
            </div>
            <div className="panel-block">
              <h3>Users</h3>
              {users.length === 0 && <p>No users yet.</p>}
              {users.length > 0 && (
                <div className="table">
                  {users.map((user) => {
                    const isEditing = editingId === user.id;
                    return (
                      <div className="panel-block" key={user.id}>
                        <div className="section-header">
                          <div>
                            <strong>{user.username}</strong>
                            <div className="note">{user.email}</div>
                          </div>
                          <div className="actions">
                            <button className="ghost" onClick={() => handleImpersonate(user.id)}>Impersonate</button>
                            <button className="ghost" onClick={() => startEdit(user)}>Edit</button>
                            <button className="ghost" onClick={() => handleDelete(user.id)}>Delete</button>
                          </div>
                        </div>
                        {isEditing && (
                          <div className="form">
                            <label>
                              Username
                              <input
                                type="text"
                                autoComplete="off"
                                value={editValues.username ?? ""}
                                onChange={(e) => setEditValues((prev) => ({ ...prev, username: e.target.value }))}
                              />
                            </label>
                            <label>
                              Email
                              <input
                                type="email"
                                autoComplete="off"
                                value={editValues.email ?? ""}
                                onChange={(e) => setEditValues((prev) => ({ ...prev, email: e.target.value }))}
                              />
                            </label>
                            <label>
                              Password (reset)
                              <input
                                type={showEditPassword ? "text" : "password"}
                                autoComplete="new-password"
                                value={editValues.password ?? ""}
                                onChange={(e) => setEditValues((prev) => ({ ...prev, password: e.target.value }))}
                              />
                            </label>
                            <label className="checkbox">
                              <input
                                type="checkbox"
                                checked={showEditPassword}
                                onChange={(e) => setShowEditPassword(e.target.checked)}
                              />
                              Show password
                            </label>
                            <label>
                              Role
                              <select
                                value={editValues.role ?? user.role}
                                onChange={(e) => setEditValues((prev) => ({ ...prev, role: e.target.value }))}
                              >
                                <option value="user">User</option>
                                <option value="admin">Admin</option>
                              </select>
                            </label>
                            <label>
                              Status
                              <select
                                value={editValues.status ?? user.status}
                                onChange={(e) => setEditValues((prev) => ({ ...prev, status: e.target.value }))}
                              >
                                <option value="active">Active</option>
                                <option value="pending">Pending</option>
                                <option value="disabled">Disabled</option>
                              </select>
                            </label>
                            <div className="actions">
                              <button onClick={() => saveEdit(user.id)}>Save</button>
                              <button className="ghost" onClick={() => setEditingId(null)}>Cancel</button>
                            </div>
                          </div>
                        )}
                        {!isEditing && (
                          <div className="note">
                            Role: {user.role} | Status: {user.status}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
      <footer className="footer">
        <div className="footer-banner">
          <div className="footer-meta">
            <nav className="footer-links">
              <a href="https://github.com/trevdude83/RocketSessions" aria-label="Find out more">Find out more</a>
              <a href="#" aria-label="Contact">Contact</a>
            </nav>
            <BuildInfo />
          </div>
        </div>
      </footer>
    </div>
  );
}
