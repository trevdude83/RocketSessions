import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export default function SignOutButton({ className = "ghost" }: { className?: string }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/", { state: { loggedOut: true } });
  }

  return (
    <button className={className} type="button" onClick={handleLogout}>
      Sign out
    </button>
  );
}
