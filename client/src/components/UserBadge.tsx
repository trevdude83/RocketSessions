import { useAuth } from "../auth";

export default function UserBadge() {
  const { user } = useAuth();
  if (!user) return null;
  return <div className="banner-user">Logged in as {user.username}</div>;
}
