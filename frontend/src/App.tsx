import { useEffect, useState, useCallback } from "react";
import type { Draft, Email } from "./types/draft";
import { listDrafts, fetchDraft, approveDraft, rejectDraft, sendDraft } from "./lib/draftApi";
import DraftCard from "./components/DraftCard";
import DraftDetail from "./components/DraftDetail";

export default function App() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ draft: Draft; email: Email } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [loadingDraftId, setLoadingDraftId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showMobileDetail, setShowMobileDetail] = useState(false);

  const loadDrafts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listDrafts();
      setDrafts(data.drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load drafts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  useEffect(() => {
    if (!selectedEmailId) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetail(null);
    setDetailLoading(true);
    fetchDraft(selectedEmailId)
      .then((data) => {
        if (!cancelled) {
          setDetail({ draft: data.draft, email: data.draft.email });
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load draft detail");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEmailId]);

  const showMessage = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }, []);

  const handleSelect = (emailId: string) => {
    setSelectedEmailId(emailId);
    setShowMobileDetail(true);
  };

  const handleApprove = async (emailId: string) => {
    try {
      setLoadingAction("approve");
      setLoadingDraftId(emailId);
      setError(null);
      const updated = await approveDraft(emailId);
      setDrafts((prev) => prev.map((d) => (d.email_id === emailId ? updated : d)));
      if (detail?.draft.email_id === emailId) {
        setDetail((prev) => (prev ? { ...prev, draft: updated } : prev));
      }
      showMessage("Reply approved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setLoadingAction(null);
      setLoadingDraftId(null);
    }
  };

  const handleReject = async (emailId: string) => {
    try {
      setLoadingAction("reject");
      setLoadingDraftId(emailId);
      setError(null);
      const updated = await rejectDraft(emailId);
      setDrafts((prev) => prev.map((d) => (d.email_id === emailId ? updated : d)));
      if (detail?.draft.email_id === emailId) {
        setDetail((prev) => (prev ? { ...prev, draft: updated } : prev));
      }
      showMessage("Reply rejected.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rejection failed");
    } finally {
      setLoadingAction(null);
      setLoadingDraftId(null);
    }
  };

  const handleSend = async (emailId: string) => {
    try {
      setLoadingAction("send");
      setLoadingDraftId(emailId);
      setError(null);
      const updated = await sendDraft(emailId);
      setDrafts((prev) => prev.map((d) => (d.email_id === emailId ? updated : d)));
      if (detail?.draft.email_id === emailId) {
        setDetail((prev) => (prev ? { ...prev, draft: updated } : prev));
      }
      showMessage("Email sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setLoadingAction(null);
      setLoadingDraftId(null);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-gray-100">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Email Triage</h1>
        <button
          onClick={loadDrafts}
          disabled={loading}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      {/* Notifications */}
      {error && (
        <div className="mx-6 mt-4 rounded-md bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="mx-6 mt-4 rounded-md bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          {message}
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Draft list */}
        <aside
          className={[
            "w-full overflow-y-auto border-r border-gray-200 bg-white p-4 md:block md:w-96",
            showMobileDetail ? "hidden" : "block",
          ].join(" ")}
        >
          {loading && drafts.length === 0 ? (
            <p className="text-sm text-gray-500">Loading drafts...</p>
          ) : drafts.length === 0 ? (
            <p className="text-sm text-gray-500">No drafts found.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {drafts.map((draft) => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  isSelected={draft.email_id === selectedEmailId}
                  isActionLoading={loadingDraftId === draft.email_id}
                  onSelect={handleSelect}
                  onApprove={handleApprove}
                  onReject={handleReject}
                />
              ))}
            </div>
          )}
        </aside>

        {/* Detail pane */}
        <main
          className={[
            "flex-1 bg-white",
            showMobileDetail ? "block" : "hidden",
            "md:block",
          ].join(" ")}
        >
          {showMobileDetail && (
            <button
              onClick={() => setShowMobileDetail(false)}
              className="m-4 flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 md:hidden"
            >
               Back
            </button>
          )}
          {detailLoading ? (
            <div className="flex h-full items-center justify-center text-gray-400">
              <p className="text-sm">Loading...</p>
            </div>
          ) : detail ? (
            <DraftDetail
              draft={detail.draft}
              email={detail.email}
              onApprove={handleApprove}
              onReject={handleReject}
              onSend={handleSend}
              loadingAction={loadingAction}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">
              <p className="text-sm">Select a draft to review</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}