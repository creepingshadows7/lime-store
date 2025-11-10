import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { DEFAULT_ADMIN_EMAIL } from "../constants";
import { getProfileInitial } from "../utils/profile";

const ROLE_OPTIONS = [
  { value: "admin", label: "Administrator" },
  { value: "seller", label: "Seller" },
  { value: "standard", label: "Standard User" },
];

const normalizeAdminUser = (user) => {
  if (!user) {
    return null;
  }

  const normalizedRole =
    typeof user.role === "string" ? user.role.toLowerCase() : "standard";

  return {
    ...user,
    role: normalizedRole,
    email_verified: Boolean(user.email_verified),
  };
};

const Admin = () => {
  const { isAuthenticated, profile } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState("idle");
  const [feedback, setFeedback] = useState("");
  const [userStatuses, setUserStatuses] = useState({});
  const [profileActions, setProfileActions] = useState({});
  const [expandedUserId, setExpandedUserId] = useState(null);

  const normalizedEmail = profile?.email
    ? profile.email.trim().toLowerCase()
    : "";
  const isAdmin =
    isAuthenticated &&
    profile?.role === "admin" &&
    normalizedEmail === DEFAULT_ADMIN_EMAIL;

  const formatDateTime = (timestamp) => {
    if (!timestamp) {
      return "--";
    }

    const parsedDate = new Date(timestamp);
    return Number.isNaN(parsedDate.getTime())
      ? String(timestamp)
      : parsedDate.toLocaleString();
  };

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
          const normalizedList = data.users
            .map((user) => normalizeAdminUser(user))
            .filter(Boolean);
          setUsers(normalizedList);
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

  const handleProfileToggle = (userId) => {
    setExpandedUserId((prev) => (prev === userId ? null : userId));
  };

  const updateProfileActionStatus = (
    userId,
    actionKey,
    state,
    message = ""
  ) => {
    setProfileActions((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] ?? {}),
        [actionKey]: { state, message },
      },
    }));
  };

  const clearUserActionState = (userId) => {
    setProfileActions((prev) => {
      if (!prev[userId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[userId];
      return next;
    });

    setUserStatuses((prev) => {
      if (!prev[userId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  const handleRemoveAvatar = async (userId) => {
    updateProfileActionStatus(
      userId,
      "removeAvatar",
      "loading",
      "Removing profile picture..."
    );
    setFeedback("");

    try {
      const { data } = await apiClient.delete(
        `/api/admin/users/${userId}/avatar`
      );

      const normalizedUser = normalizeAdminUser(data?.user);
      if (normalizedUser) {
        setUsers((prev) =>
          prev.map((user) =>
            user.id === userId ? { ...user, ...normalizedUser } : user
          )
        );
      }

      updateProfileActionStatus(
        userId,
        "removeAvatar",
        "success",
        data?.message ?? "Profile picture removed."
      );
    } catch (error) {
      const message =
        error.response?.data?.message ??
        "Unable to remove the profile picture right now.";
      updateProfileActionStatus(userId, "removeAvatar", "error", message);
    }
  };

  const handleVerifyEmail = async (userId, desiredState = true) => {
    updateProfileActionStatus(
      userId,
      "verifyEmail",
      "loading",
      desiredState
        ? "Marking email as verified..."
        : "Reverting verification..."
    );
    setFeedback("");

    try {
      const { data } = await apiClient.put(
        `/api/admin/users/${userId}/verify`,
        {
          verified: desiredState,
        }
      );

      const normalizedUser = normalizeAdminUser(data?.user);
      if (normalizedUser) {
        setUsers((prev) =>
          prev.map((user) =>
            user.id === userId ? { ...user, ...normalizedUser } : user
          )
        );
      }

      updateProfileActionStatus(
        userId,
        "verifyEmail",
        "success",
        data?.message ??
          (desiredState
            ? "Email marked as verified."
            : "Verification removed for this email.")
      );
    } catch (error) {
      const message =
        error.response?.data?.message ??
        "We couldn't update the verification status. Please try again.";
      updateProfileActionStatus(userId, "verifyEmail", "error", message);
    }
  };

  const handleDeleteUser = async (userId) => {
    updateProfileActionStatus(
      userId,
      "delete",
      "loading",
      "Deleting account..."
    );
    setFeedback("");

    try {
      const { data } = await apiClient.delete(`/api/admin/users/${userId}`);

      setUsers((prev) => prev.filter((user) => user.id !== userId));
      setExpandedUserId((prev) => (prev === userId ? null : prev));
      clearUserActionState(userId);

      setFeedback(data?.message ?? "Account removed from the directory.");
      setStatus("success");
    } catch (error) {
      const message =
        error.response?.data?.message ?? "Unable to delete this account.";
      updateProfileActionStatus(userId, "delete", "error", message);
    }
  };

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
      const normalizedUser = normalizeAdminUser(updatedUser);

      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId
            ? normalizedUser
              ? { ...user, ...normalizedUser }
              : { ...user, role: resolvedRole }
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
                  <th className="admin-table__profile-header">Profile</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const normalizedRole =
                    typeof user.role === "string"
                      ? user.role.toLowerCase()
                      : "standard";
                  const avatarUrl = user.avatar_url || "";
                  const avatarInitial = getProfileInitial(user);
                  const displayName = user.name || "--";
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
                  const joinedDate = formatDateTime(user.created_at);
                  const updatedDate = formatDateTime(user.updated_at);
                  const lastLoginDate = formatDateTime(user.last_login_at);
                  const verifiedDate = formatDateTime(user.verified_at);
                  const isEmailVerified = Boolean(user.email_verified);
                  const isExpanded = expandedUserId === user.id;
                  const roleLabel =
                    ROLE_OPTIONS.find(
                      (option) => option.value === normalizedRole
                    )?.label ?? "Standard User";
                  const locationSummary = [
                    user.address,
                    user.city,
                    user.country,
                  ]
                    .filter(Boolean)
                    .join(", ");
                  const hasAvatar = Boolean(avatarUrl);
                  const actionState = profileActions[user.id] ?? {};
                  const removeAvatarStatus = actionState.removeAvatar ?? {
                    state: "idle",
                    message: "",
                  };
                  const deleteStatus = actionState.delete ?? {
                    state: "idle",
                    message: "",
                  };
                  const verifyEmailStatus = actionState.verifyEmail ?? {
                    state: "idle",
                    message: "",
                  };
                  const isRemovingAvatar =
                    removeAvatarStatus.state === "loading";
                  const isDeleting = deleteStatus.state === "loading";
                  const isVerifyingEmail =
                    verifyEmailStatus.state === "loading";
                  const profileMessages = [
                    verifyEmailStatus,
                    removeAvatarStatus,
                    deleteStatus,
                  ].filter((entry) => entry.message);
                  const emailStatusLabel = isEmailVerified
                    ? verifiedDate !== "--"
                      ? `Verified on ${verifiedDate}`
                      : "Email verified"
                    : "Not verified";
                  const profileDetails = [
                    { label: "User ID", value: user.id || "--" },
                    { label: "Role", value: roleLabel },
                    {
                      label: "Email Status",
                      value: emailStatusLabel,
                    },
                    { label: "Phone", value: user.phone || "--" },
                    {
                      label: "Location",
                      value: locationSummary || "Not shared",
                    },
                    { label: "Member Since", value: joinedDate },
                    { label: "Last Login", value: lastLoginDate },
                    { label: "Last Updated", value: updatedDate },
                  ];
                  const profileNote = user.bio || user.notes || "";

                  return (
                    <Fragment key={user.id}>
                      <tr key={user.id}>
                        <td>
                          <div className="admin-table__user">
                            <div
                              className="admin-table__avatar"
                              role="img"
                              aria-label={`${displayName}'s avatar`}
                            >
                              {avatarUrl ? (
                                <img
                                  src={avatarUrl}
                                  alt=""
                                  className="admin-table__avatar-image"
                                />
                              ) : (
                                <span
                                  className="admin-table__avatar-fallback"
                                  aria-hidden="true"
                                >
                                  {avatarInitial}
                                </span>
                              )}
                            </div>
                            <span className="admin-table__user-name">
                              {displayName}
                            </span>
                          </div>
                        </td>
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
                            <p className={feedbackClass}>
                              {statusEntry.message}
                            </p>
                          ) : null}
                        </td>
                        <td className="admin-table__profile-cell">
                          <button
                            type="button"
                            className={`admin-table__profile-button ${
                              isExpanded ? "is-active" : ""
                            }`}
                            onClick={() => handleProfileToggle(user.id)}
                          >
                            {isExpanded ? "Hide Profile" : "View Profile"}
                            <span
                              className="admin-table__profile-button-icon"
                              aria-hidden="true"
                            >
                              &gt;
                            </span>
                          </button>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="admin-table__profile-row">
                          <td colSpan={6}>
                            <div className="profile-card">
                              <div className="profile-card__header">
                                <div className="profile-card__identity">
                                  <div className="profile-card__avatar">
                                    {avatarUrl ? (
                                      <img
                                        src={avatarUrl}
                                        alt=""
                                        className="profile-card__avatar-image"
                                      />
                                    ) : (
                                      <span className="profile-card__avatar-fallback">
                                        {avatarInitial}
                                      </span>
                                    )}
                                  </div>
                                  <div>
                                    <p className="profile-card__name">
                                      {displayName}
                                    </p>
                                    <p className="profile-card__email">
                                      {user.email || "Email not provided"}
                                    </p>
                                  </div>
                                </div>
                                <div className="profile-card__tags">
                                  <span className="profile-card__tag">
                                    {roleLabel}
                                  </span>
                                  <span className="profile-card__tag profile-card__tag--muted">
                                    Member since {joinedDate}
                                  </span>
                                  <span
                                    className={`profile-card__tag ${
                                      isEmailVerified
                                        ? "profile-card__tag--success"
                                        : "profile-card__tag--warning"
                                    }`}
                                  >
                                    {isEmailVerified
                                      ? "Email Verified"
                                      : "Email Pending"}
                                  </span>
                                </div>
                              </div>
                              <div className="profile-card__grid">
                                {profileDetails.map((detail) => (
                                  <div
                                    key={`${user.id}-${detail.label}`}
                                    className="profile-card__fact"
                                  >
                                    <p className="profile-card__label">
                                      {detail.label}
                                    </p>
                                    <p className="profile-card__value">
                                      {detail.value}
                                    </p>
                                  </div>
                                ))}
                              </div>
                              {profileNote ? (
                                <div className="profile-card__note">
                                  <p className="profile-card__label">
                                    Notes
                                  </p>
                                  <p className="profile-card__value">
                                    {profileNote}
                                  </p>
                                </div>
                              ) : null}
                              <div className="profile-card__actions">
                                <button
                                  type="button"
                                  className={`profile-card__action ${
                                    isEmailVerified
                                      ? "profile-card__action--ghost"
                                      : "profile-card__action--success"
                                  }`}
                                  onClick={() =>
                                    handleVerifyEmail(
                                      user.id,
                                      !isEmailVerified
                                    )
                                  }
                                  disabled={isVerifyingEmail}
                                >
                                  {isVerifyingEmail
                                    ? "Updating..."
                                    : isEmailVerified
                                    ? "Mark Unverified"
                                    : "Verify Email"}
                                </button>
                                <button
                                  type="button"
                                  className="profile-card__action profile-card__action--ghost"
                                  onClick={() => handleRemoveAvatar(user.id)}
                                  disabled={isRemovingAvatar || !hasAvatar}
                                >
                                  {isRemovingAvatar
                                    ? "Removing..."
                                    : hasAvatar
                                    ? "Remove Picture"
                                    : "No Picture"}
                                </button>
                                <button
                                  type="button"
                                  className="profile-card__action profile-card__action--danger"
                                  onClick={() => handleDeleteUser(user.id)}
                                  disabled={isDeleting || isDefaultAdmin}
                                >
                                  {isDeleting
                                    ? "Deleting..."
                                    : isDefaultAdmin
                                    ? "Locked Admin"
                                    : "Delete Account"}
                                </button>
                              </div>
                              {profileMessages.length ? (
                                <div className="profile-card__action-feedback">
                                  {profileMessages.map((entry, index) => (
                                    <p
                                      key={`${user.id}-action-${index}`}
                                      className={`profile-card__action-message profile-card__action-message--${entry.state}`}
                                    >
                                      {entry.message}
                                    </p>
                                  ))}
                                </div>
                              ) : null}
                              <div className="profile-card__footer">
                                <p>
                                  Last login recorded:{" "}
                                  <strong>{lastLoginDate}</strong>
                                </p>
                                <p>
                                  Need to take action? Promote, demote, delete,
                                  or refresh their visuals directly from this
                                  panel.
                                </p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {feedback ? (
          <p
            className={`form-feedback admin-page__feedback ${
              status === "error" ? "form-feedback--error" : "form-feedback--success"
            }`}
          >
            {feedback}
          </p>
        ) : null}
      </div>
    </section>
  );
};

export default Admin;
