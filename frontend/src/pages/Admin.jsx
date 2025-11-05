import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { DEFAULT_ADMIN_EMAIL } from "../constants";

const ROLE_OPTIONS = [
  { value: "admin", label: "Administrator" },
  { value: "seller", label: "Seller" },
  { value: "standard", label: "Standard User" },
];

const Admin = () => {
  const { isAuthenticated, profile } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState("idle");
  const [feedback, setFeedback] = useState("");
  const [userStatuses, setUserStatuses] = useState({});

  const normalizedEmail = profile?.email
    ? profile.email.trim().toLowerCase()
    : "";
  const isAdmin =
    isAuthenticated &&
    profile?.role === "admin" &&
    normalizedEmail === DEFAULT_ADMIN_EMAIL;

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login", { replace: true });
      return;
    }

    if (!isAdmin) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, isAdmin, navigate]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const fetchUsers = async () => {
      setStatus("loading");
      setFeedback("");

      try {
        const { data } = await apiClient.get("/api/admin/users");
        if (Array.isArray(data?.users)) {
          setUsers(
            data.users.map((user) => ({
              ...user,
              role: typeof user.role === "string" ? user.role.toLowerCase() : "standard",
            }))
          );
        } else {
          setUsers([]);
        }
        setStatus("success");
      } catch (error) {
        const message =
          error.response?.data?.message ??
          "We couldn't load the user directory. Please try again.";
        setStatus("error");
        setFeedback(message);
      }
    };

    fetchUsers();
  }, [isAdmin]);

  const handleRoleChange = async (userId, nextRole) => {
    const previousUser = users.find((user) => user.id === userId);
    const previousRole =
      typeof previousUser?.role === "string"
        ? previousUser.role.toLowerCase()
        : "standard";

    if (!nextRole || nextRole === previousRole) {
      return;
    }

    setUserStatuses((prev) => ({
      ...prev,
      [userId]: { state: "loading", message: "" },
    }));
    setFeedback("");

    setUsers((prev) =>
      prev.map((user) =>
        user.id === userId ? { ...user, role: nextRole } : user
      )
    );

    try {
      const { data } = await apiClient.put(
        `/api/admin/users/${userId}/role`,
        {
          role: nextRole,
        }
      );

      const updatedUser = data?.user ?? null;
      const resolvedRole =
        typeof updatedUser?.role === "string"
          ? updatedUser.role.toLowerCase()
          : nextRole;

      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId
            ? {
                ...user,
                ...updatedUser,
                role: resolvedRole,
              }
            : user
        )
      );

      setUserStatuses((prev) => ({
        ...prev,
        [userId]: {
          state: "success",
          message: data?.message ?? `Role updated to ${resolvedRole}.`,
        },
      }));
    } catch (error) {
      const message =
        error.response?.data?.message ??
        "We could not update that user's role. Please try again.";

      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId ? { ...user, role: previousRole } : user
        )
      );

      setUserStatuses((prev) => ({
        ...prev,
        [userId]: { state: "error", message },
      }));
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <section className="page admin-page">
      <div className="admin-page__header">
        <p className="eyebrow">Admin</p>
        <h1 className="page__title">Manage Lime Store Members</h1>
        <p className="page__subtitle">
          Review every registered profile and adjust their access level between
          administrator, seller, and standard access tiers.
        </p>
      </div>
      <div className="admin-page__card">
        {status === "loading" ? (
          <p className="page__status">Fetching the member directory...</p>
        ) : users.length === 0 ? (
          <p className="page__status">
            No profiles found yet. Invite customers to register to see them
            listed here.
          </p>
        ) : (
          <div className="admin-table__wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Member Since</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const normalizedRole =
                    typeof user.role === "string"
                      ? user.role.toLowerCase()
                      : "standard";
                  const statusEntry = userStatuses[user.id] ?? {
                    state: "idle",
                    message: "",
                  };
                  const isSaving = statusEntry.state === "loading";
                  const feedbackClass =
                    statusEntry.state === "error"
                      ? "admin-table__feedback admin-table__feedback--error"
                      : statusEntry.state === "success"
                      ? "admin-table__feedback admin-table__feedback--success"
                      : "admin-table__feedback";
                  const isDefaultAdmin =
                    (user.email ?? "").trim().toLowerCase() ===
                    DEFAULT_ADMIN_EMAIL;
                  const joinedDate = user.created_at
                    ? new Date(user.created_at).toLocaleString()
                    : "--";

                  return (
                    <tr key={user.id}>
                      <td>{user.name || "--"}</td>
                      <td>{user.email || "--"}</td>
                      <td>{user.phone || "--"}</td>
                      <td>{joinedDate}</td>
                      <td>
                        <div className="admin-table__role-control">
                          <select
                            value={normalizedRole}
                            onChange={(event) =>
                              handleRoleChange(user.id, event.target.value)
                            }
                            disabled={isSaving}
                          >
                            {ROLE_OPTIONS.map((option) => (
                              <option
                                key={option.value}
                                value={option.value}
                                disabled={
                                  isDefaultAdmin && option.value !== "admin"
                                }
                              >
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <span className="admin-table__role-indicator">
                            {normalizedRole === "admin"
                              ? "Admin"
                              : normalizedRole === "seller"
                              ? "Seller"
                              : "Standard"}
                          </span>
                        </div>
                        {statusEntry.message ? (
                          <p className={feedbackClass}>{statusEntry.message}</p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {feedback && status === "error" ? (
          <p className="form-feedback form-feedback--error admin-page__feedback">
            {feedback}
          </p>
        ) : null}
      </div>
    </section>
  );
};

export default Admin;
