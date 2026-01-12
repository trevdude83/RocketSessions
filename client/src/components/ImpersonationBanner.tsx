import { exitImpersonation } from "../api";
import { useAuth } from "../auth";

export default function ImpersonationBanner() {
  const { impersonator, refresh } = useAuth();

  if (!impersonator) return null;

  async function handleExit() {
    await exitImpersonation();
    await refresh();
  }

  return (
    <div className="impersonation-banner">
      <span>Viewing as another user. Admin: {impersonator.username}</span>
      <button className="ghost" onClick={handleExit}>Exit impersonation</button>
    </div>
  );
}
