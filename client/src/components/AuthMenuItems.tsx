import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import SignOutButton from "./SignOutButton";
import ThemeToggle from "./ThemeToggle";

export default function AuthMenuItems({ showAdminLink = false }: { showAdminLink?: boolean }) {
  const { user } = useAuth();

  return (
    <>
      <ThemeToggle />
      {showAdminLink && user?.role === "admin" && (
        <>
          <Link className="menu-link" to="/admin">System admin</Link>
          <Link className="menu-link" to="/admin/users">User admin</Link>
          <Link className="menu-link" to="/admin/scoreboard">ScoreboardCam</Link>
        </>
      )}
      <SignOutButton />
    </>
  );
}
