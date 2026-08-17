import { useState, useEffect } from "react";

type Email = {
  id: string;
  message_id: string;
  from_email: string;
  subject: string;
  received_at: string;
};

type Draft = {
  id: string;
  email_id: string;
  body: string;
  status: string;
  created_at: string;
  email: Email | null;
};

const API_URL = "http://localhost:5000/api/drafts";

function App() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchDrafts();
  }, []);

  const fetchDrafts = async () => {
    try {
      setLoading(true);
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error("Failed to fetch drafts");
      const data = await res.json();
      setDrafts(data.drafts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (emailId: string, action: "send" | "reject") => {
    try {
      const res = await fetch(`${API_URL}/${emailId}/${action}`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? "Failed to update status");
      }
      await fetchDrafts();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading drafts…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Draft Approvals</h1>

      {drafts.length === 0 ? (
        <p className="text-gray-500">No drafts pending review.</p>
      ) : (
        <div className="space-y-4 max-w-3xl">
          {drafts.map((draft) => (
            <div key={draft.id} className="bg-white rounded-lg shadow-sm border p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">
                    {draft.email?.subject ?? "No subject"}
                  </p>
                  <p className="text-sm text-gray-500">
                    From: {draft.email?.from_email ?? "Unknown"}
                  </p>
                </div>
                <span
                  className={`shrink-0 ml-4 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    draft.status === "PENDING_REVIEW"
                      ? "bg-yellow-100 text-yellow-800"
                      : draft.status === "SENT"
                      ? "bg-green-100 text-green-800"
                      : draft.status === "APPROVED"
                      ? "bg-blue-100 text-blue-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {draft.status}
                </span>
              </div>

              <button
                onClick={() =>
                  setExpandedId(expandedId === draft.email_id ? null : draft.email_id)
                }
                className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                {expandedId === draft.email_id ? "Hide draft" : "Show draft"}
              </button>

              {expandedId === draft.email_id && (
                <div className="mt-3 p-3 bg-gray-50 rounded-md text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {draft.body}
                </div>
              )}

              {draft.status === "PENDING_REVIEW" && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => updateStatus(draft.email_id, "send")}
                    className="px-4 py-1.5 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors"
                  >
                    Approve & Send
                  </button>
                  <button
                    onClick={() => updateStatus(draft.email_id, "reject")}
                    className="px-4 py-1.5 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;