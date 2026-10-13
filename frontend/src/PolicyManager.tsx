
import { useCallback, useEffect, useState } from "react";
import "./PolicyManager.css";

const API =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

type Policy = {
  id: number;
  name: string;
  description: string;
  created_at: string;
};

export default function PolicyManager() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  const loadPolicies = useCallback(async () => {
    setLoadingPolicies(true);

    try {
      const response = await fetch(`${API}/policies`);

      if (!response.ok) {
        throw new Error(`Could not load policies (${response.status}).`);
      }

      const data: unknown = await response.json();

      if (!Array.isArray(data)) {
        throw new Error("The backend returned an unexpected policy list.");
      }

      setPolicies(data as Policy[]);
    } catch (err) {
      setError(true);
      setMessage(
        err instanceof Error
          ? err.message
          : "Unable to connect to the backend."
      );
    } finally {
      setLoadingPolicies(false);
    }
  }, []);

  useEffect(() => {
    void loadPolicies();
  }, [loadPolicies]);

  async function savePolicy(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();

    if (!trimmedName || !trimmedDescription) {
      setError(true);
      setMessage("Enter both a policy name and its requirements.");
      return;
    }

    setLoading(true);
    setError(false);
    setMessage("");

    try {
      const isEditing = editingId !== null;
      const url = isEditing
        ? `${API}/policies/${editingId}`
        : `${API}/policies`;

      const response = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          description: trimmedDescription,
        }),
      });

      const responseText = await response.text();
      let data: { detail?: string } = {};

      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch {
          // Keep a useful status-code error if the response isn't JSON.
        }
      }

      if (!response.ok) {
        throw new Error(
          data.detail ||
            `Failed to ${isEditing ? "update" : "create"} policy (${response.status}).`
        );
      }

      setName("");
      setDescription("");
      setEditingId(null);
      setError(false);
      setMessage(
        isEditing
          ? "Policy updated successfully."
          : "Policy saved successfully."
      );

      await loadPolicies();
    } catch (err) {
      setError(true);
      setMessage(
        err instanceof Error
          ? err.message
          : "Something went wrong while saving the policy."
      );
    } finally {
      setLoading(false);
    }
  }

  function startEditing(policy: Policy) {
    setEditingId(policy.id);
    setName(policy.name);
    setDescription(policy.description);
    setError(false);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEditing() {
    setEditingId(null);
    setName("");
    setDescription("");
    setError(false);
    setMessage("");
  }

  async function deletePolicy(id: number) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this company policy?"
    );

    if (!confirmed) return;

    setDeletingId(id);
    setError(false);
    setMessage("");

    try {
      const response = await fetch(`${API}/policies/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        let detail = "";

        try {
          const data = await response.json();
          detail = data.detail || "";
        } catch {
          // The response may not contain JSON.
        }

        throw new Error(
          detail || `Could not delete policy (${response.status}).`
        );
      }

      if (editingId === id) {
        setEditingId(null);
        setName("");
        setDescription("");
      }

      setError(false);
      setMessage("Policy deleted successfully.");
      await loadPolicies();
    } catch (err) {
      setError(true);
      setMessage(
        err instanceof Error
          ? err.message
          : "Something went wrong while deleting the policy."
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="policy-manager">
      <header className="policy-header">
        <h1>Company Policies</h1>
        <p>
          Manage your organization's rules and reuse them when reviewing
          contracts.
        </p>
      </header>

      <section className="policy-form-card">
        <h2>{editingId === null ? "Add a policy" : "Edit policy"}</h2>

        <form onSubmit={savePolicy}>
          <label htmlFor="policy-name">Policy name</label>
          <input
            id="policy-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Confidentiality Policy"
            maxLength={255}
            required
          />

          <label htmlFor="policy-description">Policy requirements</label>
          <textarea
            id="policy-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the requirements a contract should follow..."
            rows={5}
            required
          />

          <div className="policy-actions">
            <button type="submit" disabled={loading}>
              {loading
                ? "Saving..."
                : editingId === null
                  ? "Save Policy"
                  : "Update Policy"}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={() => void loadPolicies()}
              disabled={loadingPolicies}
            >
              {loadingPolicies ? "Refreshing..." : "Refresh policies"}
            </button>

            {editingId !== null && (
              <button
                type="button"
                className="secondary-button"
                onClick={cancelEditing}
                disabled={loading}
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        {message && (
          <p
            role="status"
            aria-live="polite"
            className={error ? "error" : "success"}
          >
            {message}
          </p>
        )}
      </section>

      <section className="policy-list-section">
        <h2>Saved Policies ({policies.length})</h2>

        {loadingPolicies && policies.length === 0 ? (
          <p>Loading policies...</p>
        ) : policies.length === 0 ? (
          <p>No company policies saved yet. Add your first policy above.</p>
        ) : (
          <div className="policy-list">
            {policies.map((policy) => (
              <article className="policy-card" key={policy.id}>
                <div className="policy-card-content">
                  <h3>{policy.name}</h3>
                  <p>{policy.description}</p>
                  <small>Policy ID: {policy.id}</small>
                </div>

                <div className="policy-card-actions">
                  <button
                    type="button"
                    onClick={() => startEditing(policy)}
                    disabled={loading || deletingId !== null}
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    className="reject-button"
                    onClick={() => void deletePolicy(policy.id)}
                    disabled={deletingId !== null || loading}
                  >
                    {deletingId === policy.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
