import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { DEFAULT_ADMIN_EMAIL } from "../constants";

const Terms = () => {
  const { isAuthenticated, profile } = useAuth();
  const normalizedEmail = profile?.email
    ? profile.email.trim().toLowerCase()
    : "";
  const isAdmin =
    isAuthenticated &&
    profile?.role === "admin" &&
    normalizedEmail === DEFAULT_ADMIN_EMAIL;

  const [page, setPage] = useState(null);
  const [status, setStatus] = useState("loading");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    const fetchPage = async () => {
      setStatus("loading");
      setFeedback("");
      try {
        const { data } = await apiClient.get("/api/content/terms");
        setPage(data?.page ?? null);
        setStatus("success");
      } catch (error) {
        setFeedback(
          error.response?.data?.message ??
            "We could not load the Terms and Conditions right now."
        );
        setStatus("error");
      }
    };

    fetchPage();
  }, []);

  const formattedUpdatedAt = useMemo(() => {
    if (!page?.updated_at) {
      return "Not yet updated";
    }
    const parsed = new Date(page.updated_at);
    return Number.isNaN(parsed.getTime())
      ? String(page.updated_at)
      : parsed.toLocaleString();
  }, [page?.updated_at]);

  const renderContent = () => {
    if (status === "loading") {
      return <p className="page__status">Loading the latest terms...</p>;
    }

    if (status === "error") {
      return (
        <p className="form-feedback form-feedback--error">{feedback}</p>
      );
    }

    if (!page) {
      return (
        <p className="form-feedback form-feedback--error">
          The Terms and Conditions could not be found.
        </p>
      );
    }

    return (
      <article className="terms-card">
        <header className="terms-card__header">
          <div>
            <p className="eyebrow">Policy</p>
            <h2 className="terms-card__title">
              {page.title || "Terms and Conditions"}
            </h2>
            <p className="terms-card__meta">
              Last updated: <span>{formattedUpdatedAt}</span>
            </p>
            {page.updated_by ? (
              <p className="terms-card__meta">
                Updated by: <span>{page.updated_by}</span>
              </p>
            ) : null}
          </div>
          {isAdmin ? (
            <Link to="/admin" className="button button--outline">
              Edit terms
            </Link>
          ) : null}
        </header>
        <div className="terms-card__body">
          <p className="terms-content">{page.content}</p>
        </div>
      </article>
    );
  };

  return (
    <section className="page terms-page">
      <header className="page__intro">
        <p className="eyebrow">Legal</p>
        <h1 className="page__title">Terms and Conditions</h1>
        <p className="page__subtitle">
          Review how Lime Store operates, what we expect from visitors, and how
          to reach us if you have questions about your rights.
        </p>
      </header>
      {renderContent()}
    </section>
  );
};

export default Terms;
