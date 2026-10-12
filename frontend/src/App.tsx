import { useEffect, useState } from "react";

import "./App.css";
import PolicyManager from "./PolicyManager";



const API_URL = "http://127.0.0.1:8000";

type DeadlineKind = "recurring-monthly" | "ongoing" | "date-unconfirmed" | "overdue" | "due-soon" | "upcoming";

function classifyDeadline(deadline: string): { kind: DeadlineKind; label: string; display: string } {
  const value = deadline.trim().toLowerCase();

  // Recognize recurring/ongoing wording without inventing a specific calendar date.
  if (/\b(each|every|per)\s+(calendar\s+)?month\b|\bmonthly\b|\b(fifth|first|second|third|fourth|last|\d{1,2}(st|nd|rd|th)?)\s+(calendar\s+)?day of (each|every) month\b/.test(value)) {
    return { kind: "recurring-monthly", label: "Recurring monthly", display: deadline };
  }
  if (/\bthroughout the term\b|\bduring the term\b|\bfor the duration of (this|the) agreement\b|\bat all times\b|\bcontinuously\b/.test(value)) {
    return { kind: "ongoing", label: "Ongoing obligation", display: deadline };
  }

  const timestamp = Date.parse(deadline);
  if (Number.isNaN(timestamp)) {
    return { kind: "date-unconfirmed", label: "Confirm date", display: deadline };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((date.getTime() - today.getTime()) / 86400000);
  if (daysLeft < 0) return { kind: "overdue", label: `${Math.abs(daysLeft)} day(s) overdue`, display: date.toLocaleDateString() };
  if (daysLeft === 0) return { kind: "due-soon", label: "Due today", display: date.toLocaleDateString() };
  if (daysLeft <= 7) return { kind: "due-soon", label: `Due in ${daysLeft} day(s)`, display: date.toLocaleDateString() };
  return { kind: "upcoming", label: "Upcoming", display: date.toLocaleDateString() };
}




type AnalysisField = {

  value: string | null;

  evidence: string | null;

};



type Party = {

  name: string | null;

  evidence: string | null;

};



type Obligation = {

  responsible_party: string | null;

  description: string;

  deadline: string | null;

  evidence: string;

};



type ReviewedObligation = Obligation & {

  id?: number;

  reviewStatus: "pending" | "approved" | "rejected";

};



type ContractAnalysis = {

  parties: Party[];

  effective_date: AnalysisField;

  expiration_date: AnalysisField;

  renewal_terms: AnalysisField;

  notice_period: AnalysisField;

  termination_terms: AnalysisField;

  obligations: Obligation[];

  uncertainties: string[];

};



type SavedContract = {

  id: number;

  filename: string;

  created_at: string;

  obligations_count: number;

};



type SavedContractDetails = {

  id: number;

  filename: string;

  created_at: string;

  obligations: {

    id: number;

    responsible_party: string | null;

    description: string;

    deadline: string | null;

    evidence: string;

    review_status: "pending" | "approved" | "rejected";

  }[];

};

type ContractVersionItem = {
  id: number;
  version_number: number;
  filename: string;
  created_at: string;
  contract_text: string;
};

type VersionObligation = {
  id: number;
  responsible_party: string | null;
  description: string;
  deadline: string | null;
  evidence: string;
  review_status: "pending" | "approved" | "rejected";
  reviewed_at?: string | null;
};

type NoticeDeadline = {
  contract_id: number;
  filename: string;
  expiry_date: string;
  notice_period_days: number;
  notice_deadline: string;
  days_remaining: number;
  message: string;
};

type RenewalAlert = {
  contract_id: number;
  filename: string;
  renewal_date: string | null;
  expiry_date: string | null;
  notice_period_days: number | null;
  alert_date?: string | null;
  days_remaining: number;
};



type CompanyPolicy = { id: number; name: string; description: string };
type PolicyMismatch = {
  policy?: string;
  contract_clause?: string;
  issue?: string;
  severity?: string;
  reason?: string;
  recommendation?: string;
};
type PolicyCheckResult = {
  contract_id: number;
  filename: string;
  checked_policy_ids: number[];
  count: number;
  result: { mismatches?: PolicyMismatch[]; [key: string]: unknown };
};


function App() {

  const [file, setFile] = useState<File | null>(null);

  const [text, setText] = useState("");

  const [filename, setFilename] = useState("");

  const [loading, setLoading] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);

  const [error, setError] = useState("");

  const [analysis, setAnalysis] = useState<ContractAnalysis | null>(null);

  const [reviewedObligations, setReviewedObligations] = useState<

    ReviewedObligation[]

  >([]);

  const [savedContracts, setSavedContracts] = useState<SavedContract[]>([]);

  const [contractsLoading, setContractsLoading] = useState(false);

  const [dashboardStats, setDashboardStats] = useState({ totalObligations: 0, pending: 0, approved: 0, rejected: 0 });
  const [deadlineItems, setDeadlineItems] = useState<Array<{ id: number; contractId: number; filename: string; description: string; deadline: string; responsible_party: string | null; review_status: "pending" | "approved" | "rejected" }>>([]);
  const [contractSearch, setContractSearch] = useState("");
  const [contractStatusFilter, setContractStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [contractStatuses, setContractStatuses] = useState<Record<number, "pending" | "approved" | "rejected" | "none">>({});

  const [selectedContract, setSelectedContract] =

    useState<SavedContractDetails | null>(null);

  const [contractDetailsLoading, setContractDetailsLoading] = useState(false);
  const [contractVersions, setContractVersions] = useState<ContractVersionItem[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState("");
  const [versionObligations, setVersionObligations] = useState<Record<number, VersionObligation[]>>({});
  const [versionObligationsLoading, setVersionObligationsLoading] = useState<number | null>(null);
  const [versionObligationsError, setVersionObligationsError] = useState("");
  const [policies, setPolicies] = useState<CompanyPolicy[]>([]);
  const [selectedPolicyIds, setSelectedPolicyIds] = useState<number[]>([]);
  const [policyChecking, setPolicyChecking] = useState(false);
  const [policyError, setPolicyError] = useState("");
  const [policyResult, setPolicyResult] = useState<PolicyCheckResult | null>(null);

  const [activePage, setActivePage] = useState<

    "dashboard" | "contracts" | "analyze" | "settings" | "policies"

  >("dashboard");

  const [renewalAlerts, setRenewalAlerts] = useState<RenewalAlert[]>([]);
  const [renewalsLoading, setRenewalsLoading] = useState(false);

  const [noticeDeadlines, setNoticeDeadlines] =
  useState<NoticeDeadline[]>([]);
  const [noticeDeadlinesLoading, setNoticeDeadlinesLoading] =
  useState(false);


  async function handleUpload() {

    if (!file) {

      setError("Please select a PDF or DOCX file first.");

      return;

    }



    setLoading(true);

    setError("");

    setText("");

    setFilename("");

    setAnalysis(null);



    const formData = new FormData();

    formData.append("file", file);



    try {

      const response = await fetch(`${API_URL}/contracts/extract`, {

        method: "POST",

        body: formData,

      });



      const data = await response.json();



      if (!response.ok) {

        throw new Error(data.detail || "Failed to extract the document.");

      }



      setFilename(data.filename);

      setText(data.text);

    } catch (err) {

      setError(

        err instanceof Error

          ? err.message

          : "Could not connect to the backend.",

      );

    } finally {

      setLoading(false);

    }

  }



  async function handleAnalyze() {

    if (text.trim().length < 50) {

      setError("Please provide at least 50 characters of contract text.");

      return;

    }



    setAnalyzing(true);

    setError("");

    setAnalysis(null);



    try {

      const response = await fetch(`${API_URL}/contracts/analyze`, {

        method: "POST",

        headers: {

          "Content-Type": "application/json",

        },

        body: JSON.stringify({ text }),

      });



      const data = await response.json();



      if (!response.ok) {

        throw new Error(data.detail || "Contract analysis failed.");

      }



      const result = data as ContractAnalysis;



      setAnalysis(result);

      setReviewedObligations(

        (result.obligations ?? []).map((obligation) => ({

          ...obligation,

          reviewStatus: "pending",

        })),

      );

    } catch (err) {

      setError(

        err instanceof Error

          ? err.message

          : "Could not connect to the backend.",

      );

    } finally {

      setAnalyzing(false);

    }

  }



  const analysisFields: { label: string; item: AnalysisField | undefined }[] =

    analysis

      ? [

          { label: "Effective date", item: analysis.effective_date },

          { label: "Expiration date", item: analysis.expiration_date },

          { label: "Renewal terms", item: analysis.renewal_terms },

          { label: "Notice period", item: analysis.notice_period },

          { label: "Termination terms", item: analysis.termination_terms },

        ]

      : [];



  function updateObligation(

    index: number,

    changes: Partial<ReviewedObligation>,

  ) {

    setReviewedObligations((previous) =>

      previous.map((obligation, i) =>

        i === index ? { ...obligation, ...changes } : obligation,

      ),

    );

  }



  const handleSaveContract = async () => {

    if (!analysis || !text.trim()) {

      setError("Analyze a contract before saving.");

      return;

    }



    try {

      setError("");



      const response = await fetch(`${API_URL}/contracts/save`, {

        method: "POST",

        headers: {

          "Content-Type": "application/json",

        },

        body: JSON.stringify({

          filename: filename || "pasted_contract.txt",

          text,

          analysis,

        }),

      });



      const data = await response.json();



      if (!response.ok) {

        throw new Error(data.detail || "Failed to save contract.");

      }



      const contractResponse = await fetch(

        `${API_URL}/contracts/${data.contract_id}`,

      );



      const contractData = await contractResponse.json();



      if (!contractResponse.ok) {

        throw new Error("Contract saved, but could not load its obligations.");

      }



      setReviewedObligations((previous) =>

        previous.map((obligation) => {

          const match = contractData.obligations.find(

            (saved: { id: number; description: string }) =>

              saved.description === obligation.description,

          );



          return match

            ? {

                ...obligation,

                id: match.id,

                reviewStatus: "pending",

              }

            : obligation;

        }),

      );



      alert(`Contract saved successfully! ID: ${data.contract_id}`);

    } catch (err) {

      setError(err instanceof Error ? err.message : "Failed to save contract.");

    }

  };



  function editObligation(index: number) {

    const obligation = reviewedObligations[index];

    if (!obligation) return;



    const description = window.prompt(

      "Edit obligation description:",

      obligation.description,

    );



    if (description === null || !description.trim()) return;



    const deadline = window.prompt("Edit deadline:", obligation.deadline ?? "");



    if (deadline === null) return;



    updateObligation(index, {

      description: description.trim(),

      deadline: deadline.trim() || null,

      reviewStatus: "pending",

    });

  }



  const saveObligationReview = async (

    obligationId: number,

    reviewStatus: "approved" | "rejected" | "pending",

  ) => {

    try {

      const response = await fetch(

        `${API_URL}/obligations/${obligationId}/review`,

        {

          method: "PATCH",

          headers: {

            "Content-Type": "application/json",

          },

          body: JSON.stringify({ review_status: reviewStatus }),

        },

      );



      const data = await response.json();



      if (!response.ok) {

        throw new Error(data.detail || "Could not save review status.");

      }



      return true;

    } catch (err) {

      setError(

        err instanceof Error ? err.message : "Could not save review status.",

      );

      return false;

    }

  };



  const loadSavedContracts = async () => {

    try {

      setContractsLoading(true);



      const response = await fetch(`${API_URL}/contracts`);



      if (!response.ok) {

        throw new Error("Could not load saved contracts.");

      }



      const data: SavedContract[] = await response.json();

      setSavedContracts(data);

    } catch (err) {

      setError(

        err instanceof Error ? err.message : "Could not load saved contracts.",

      );

    } finally {

      setContractsLoading(false);

    }

  };



  useEffect(() => {
    loadSavedContracts();
    loadRenewalAlerts();
    loadNoticeDeadlines();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardStats() {
      if (savedContracts.length === 0) {
        setDashboardStats({ totalObligations: 0, pending: 0, approved: 0, rejected: 0 });
        return;
      }

      try {
        const details = await Promise.all(
          savedContracts.map(async (contract) => {
            const response = await fetch(`${API_URL}/contracts/${contract.id}`);
            if (!response.ok) return { contractId: contract.id, obligations: [] };
            const data = await response.json();
            return { contractId: contract.id, obligations: Array.isArray(data.obligations) ? data.obligations : [] };
          }),
        );

        if (cancelled) return;
        const obligations = details.flatMap((item) => item.obligations);
        const contractNames = new Map(savedContracts.map((contract) => [contract.id, contract.filename]));
        const withDeadlines = details.flatMap(({ contractId, obligations: items }) =>
          items
            .filter((item: { deadline?: string | null }) => Boolean(item.deadline && item.deadline.trim()))
            .map((item: { id: number; description: string; deadline: string; responsible_party: string | null; review_status: "pending" | "approved" | "rejected" }) => ({
              id: item.id,
              contractId,
              filename: contractNames.get(contractId) ?? `Contract #${contractId}`,
              description: item.description,
              deadline: item.deadline,
              responsible_party: item.responsible_party,
              review_status: item.review_status,
            })),
        );
        setDeadlineItems(withDeadlines.sort((a, b) => {
          const da = Date.parse(a.deadline);
          const db = Date.parse(b.deadline);
          if (Number.isNaN(da) && Number.isNaN(db)) return a.deadline.localeCompare(b.deadline);
          if (Number.isNaN(da)) return 1;
          if (Number.isNaN(db)) return -1;
          return da - db;
        }));
        const statuses: Record<number, "pending" | "approved" | "rejected" | "none"> = {};
        details.forEach(({ contractId, obligations: items }) => {
          if (items.length === 0) statuses[contractId] = "none";
          else if (items.some((item: { review_status: string }) => item.review_status === "pending")) statuses[contractId] = "pending";
          else if (items.some((item: { review_status: string }) => item.review_status === "rejected")) statuses[contractId] = "rejected";
          else statuses[contractId] = "approved";
        });
        setContractStatuses(statuses);
        setDashboardStats({
          totalObligations: obligations.length,
          pending: obligations.filter((item) => item.review_status === "pending").length,
          approved: obligations.filter((item) => item.review_status === "approved").length,
          rejected: obligations.filter((item) => item.review_status === "rejected").length,
        });
      } catch {
        // Keep the dashboard usable if the stats request fails.
      }
    }

    loadDashboardStats();
    return () => { cancelled = true; };
  }, [savedContracts]);



  const filteredSavedContracts = savedContracts.filter((contract) => {
    const matchesSearch = contract.filename.toLowerCase().includes(contractSearch.trim().toLowerCase());
    const matchesStatus = contractStatusFilter === "all" || contractStatuses[contract.id] === contractStatusFilter;
    return matchesSearch && matchesStatus;
  });

  async function loadContractVersions(contractId: number) {
    setVersionsLoading(true);
    setVersionsError("");
    setContractVersions([]);
    setVersionObligations({});
    try {
      const response = await fetch(`${API_URL}/contracts/${contractId}/versions`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to load contract versions.");
      setContractVersions(Array.isArray(data.versions) ? data.versions : []);
    } catch (err) {
      setVersionsError(err instanceof Error ? err.message : "Could not load version history.");
    } finally {
      setVersionsLoading(false);
    }
  }

  async function loadVersionObligations(contractId: number, versionNumber: number) {
    setVersionObligationsLoading(versionNumber);
    setVersionObligationsError("");
    try {
      const response = await fetch(`${API_URL}/contracts/${contractId}/versions/${versionNumber}/obligations`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to load saved obligations.");
      setVersionObligations((previous) => ({ ...previous, [versionNumber]: Array.isArray(data.obligations) ? data.obligations : [] }));
    } catch (err) {
      setVersionObligationsError(err instanceof Error ? err.message : "Could not load saved obligations.");
    } finally {
      setVersionObligationsLoading(null);
    }
  }

  const openSavedContract = async (contractId: number) => {

    try {

      setError("");

      setContractDetailsLoading(true);



      const response = await fetch(`${API_URL}/contracts/${contractId}`);



      const data = await response.json();



      if (!response.ok) {

        throw new Error(data.detail || "Could not open this contract.");

      }



      setSelectedContract(data);
      void loadContractVersions(contractId);
      setPolicyResult(null);
      setSelectedPolicyIds([]);
      await loadPolicies();

    } catch (err) {

      setError(

        err instanceof Error ? err.message : "Could not open this contract.",

      );

    } finally {

      setContractDetailsLoading(false);

    }

  };


async function editSavedObligation(
  obligation: SavedContractDetails["obligations"][number]
) {
  const description = window.prompt(
    "Edit obligation description:",
    obligation.description
  );

  if (description === null || !description.trim()) return;

  const deadline = window.prompt(
    "Edit deadline:",
    obligation.deadline ?? ""
  );

  if (deadline === null) return;

  const responsibleParty = window.prompt(
    "Edit responsible party:",
    obligation.responsible_party ?? ""
  );

  if (responsibleParty === null) return;

  try {
    setError("");

    const response = await fetch(
      `${API_URL}/obligations/${obligation.id}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
        description: description.trim(),
        deadline: deadline.trim() || null,
        responsible_party: responsibleParty.trim() || null,
      }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail || "Could not update the obligation."
      );
    }

    

    // Reload the saved contract so the latest database values appear.
    if (selectedContract) {
      await openSavedContract(selectedContract.id);
    }

    await loadSavedContracts();
    alert("Obligation updated successfully!");
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : "Could not update the obligation."
    );
  }
}


async function updateSavedObligationStatus(
  obligationId: number,
  reviewStatus: "pending" | "approved" | "rejected"
) {
  try {
    setError("");

    const response = await fetch(
      `${API_URL}/obligations/${obligationId}/review`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          review_status: reviewStatus,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail || "Could not update review status."
      );
    }

    if (selectedContract) {
      await openSavedContract(selectedContract.id);
    }

    await loadSavedContracts();
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : "Could not update review status."
    );
  }
}



  async function loadPolicies() {
    try {
      setPolicyError("");
      const response = await fetch(`${API_URL}/policies`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not load company policies.");
      setPolicies(Array.isArray(data) ? data : []);
    } catch (err) {
      setPolicyError(err instanceof Error ? err.message : "Could not load policies.");
    }
  }

  async function checkPolicyCompliance() {
    if (!selectedContract) return setPolicyError("Open a saved contract first.");
    if (selectedPolicyIds.length === 0) return setPolicyError("Select at least one company policy.");
    try {
      setPolicyChecking(true);
      setPolicyError("");
      setPolicyResult(null);
      const response = await fetch(`${API_URL}/contracts/${selectedContract.id}/policy-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy_ids: selectedPolicyIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "The policy compliance check failed.");
      setPolicyResult(data as PolicyCheckResult);
    } catch (err) {
      setPolicyError(err instanceof Error ? err.message : "Could not check policy compliance.");
    } finally {
      setPolicyChecking(false);
    }
  }

async function loadRenewalAlerts() {
  setRenewalsLoading(true);

  try {
    const response = await fetch(
      `${API_URL}/renewals/upcoming?days=730`
    );

    if (!response.ok) {
      throw new Error("Failed to load renewal alerts");
    }

    const data = await response.json();
    setRenewalAlerts(data.alerts ?? []);
  } catch (error) {
    console.error("Error loading renewal alerts:", error);
    setError(
      error instanceof Error
        ? error.message
        : "Could not load renewal alerts."
    );
  } finally {
    setRenewalsLoading(false);
  }
}


async function loadNoticeDeadlines() {
  setNoticeDeadlinesLoading(true);

  try {
    const response = await fetch(
      `${API_URL}/renewals/notice-deadlines?days=730`
    );

    if (!response.ok) {
      throw new Error("Failed to load notice deadlines");
    }

    const data = await response.json();
    setNoticeDeadlines(data.alerts ?? []);
  } catch (error) {
    console.error("Error loading notice deadlines:", error);
    setError(
      error instanceof Error
        ? error.message
        : "Could not load notice deadlines."
    );
  } finally {
    setNoticeDeadlinesLoading(false);
  }
}

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><div className="logo">CA</div><div><h2>Contract Assistant</h2><p>Contract intelligence</p></div></div>
        <p className="sidebar-label">WORKSPACE</p>
        <nav className="sidebar-nav">
          <button className={activePage === "policies" ? "nav-item active" : "nav-item"} onClick={() => setActivePage("policies")}><span>▧</span> Company Policies</button>
          <button className={activePage === "dashboard" ? "nav-item active" : "nav-item"} onClick={() => setActivePage("dashboard")}><span>▦</span> Dashboard</button>
          <button className={activePage === "contracts" ? "nav-item active" : "nav-item"} onClick={() => setActivePage("contracts")}><span>▤</span> All Contracts</button>
          <button className={activePage === "analyze" ? "nav-item active" : "nav-item"} onClick={() => setActivePage("analyze")}><span>＋</span> Analyze Contract</button>
          <button className={activePage === "settings" ? "nav-item active" : "nav-item"} onClick={() => setActivePage("settings")}><span>⚙</span> Settings</button>
        </nav>
        <div className="sidebar-footer"><span className="status-dot" />Backend connected</div>
      </aside>
      <main className="app">
        <header className="topbar"><div><p className="eyebrow">CONTRACT WORKSPACE</p><h1>{activePage === "dashboard" ? "Dashboard" : activePage === "contracts" ? "All Contracts" : activePage === "analyze" ? "Analyze Contract" : activePage === "policies" ? "Company Policies" : "Settings"}</h1></div><span className="topbar-badge">AI-powered review</span></header>



      {activePage === "analyze" && <>
      <section className="intro">

        <p className="eyebrow">CONTRACT INTELLIGENCE</p>

        <h2>Your contracts, made easier to understand.</h2>

        <p>

          Upload a contract to identify key dates, renewal conditions, and

          responsibilities, with supporting evidence from the document.

        </p>

      </section>



      <section className="panel">

        <h3>Upload a contract</h3>

        <p className="muted">Supported formats: PDF and DOCX · Maximum 10 MB</p>



        <label className="file-picker">

          <span className="upload-icon">↑</span>

          <strong>{file ? file.name : "Choose a contract file"}</strong>

          <span className="muted">

            {file ? "File selected" : "Click here to browse your files"}

          </span>

          <input

            type="file"

            accept=".pdf,.docx"

            onChange={(event) => {

              setFile(event.target.files?.[0] ?? null);

              setError("");

              setText("");

              setFilename("");

              setAnalysis(null);

            }}

          />

        </label>



        <button onClick={handleUpload} disabled={loading || !file}>

          {loading ? "Extracting text..." : "Upload and extract text"}

        </button>



        {error && <p className="error">{error}</p>}

      </section>



      </>}

      {(activePage === "dashboard" || activePage === "contracts") && <>
      {activePage === "dashboard" && <>
        <section className="dashboard-welcome">
          <h2>Welcome to your contract workspace</h2>
          <p className="muted">Review your saved contracts or start a new analysis.</p>
          <button onClick={() => setActivePage("analyze")}>＋ Analyze a contract</button>
        </section>
        <section className="dashboard-stats" aria-label="Contract summary">
          <article className="dashboard-stat"><span className="stat-icon">▤</span><p>Total Contracts</p><strong>{savedContracts.length}</strong><small>Saved in your workspace</small></article>
          <article className="dashboard-stat"><span className="stat-icon">☷</span><p>Total Obligations</p><strong>{dashboardStats.totalObligations}</strong><small>Across saved contracts</small></article>
          <article className="dashboard-stat"><span className="stat-icon pending-icon">◷</span><p>Pending Review</p><strong>{dashboardStats.pending}</strong><small>Waiting for review</small></article>
          <article className="dashboard-stat"><span className="stat-icon approved-icon">✓</span><p>Approved</p><strong>{dashboardStats.approved}</strong><small>Reviewed and approved</small></article>
        </section>
        <section className="deadline-panel">
          <div className="section-heading deadline-heading">
            <div>
              <p className="eyebrow">FOLLOW-UP</p>
              <h3>Obligation deadlines</h3>
              <p className="muted">Deadlines extracted from saved contracts. Verify each date against the original document.</p>
            </div>
            <span className="count">{deadlineItems.length} with deadline</span>
          </div>
          {deadlineItems.length === 0 ? (
            <p className="muted">No deadlines are recorded yet. Analyze and save a contract with a clearly stated deadline to see it here.</p>
          ) : (
            <div className="deadline-list">
              {deadlineItems.slice(0, 6).map((item) => {
                const classified = classifyDeadline(item.deadline);
                return (
                  <article className="deadline-item" key={`${item.contractId}-${item.id}`}>
                    <div className="deadline-item-main">
                      <strong>{item.description}</strong>
                      <p className="muted">{item.filename} · {item.responsible_party || "Responsible party not specified"}</p>
                      <p className="deadline-date">Deadline: {classified.display}</p>
                      {classified.kind === "recurring-monthly" && <p className="deadline-extra">Recurring obligation detected. Confirm the exact monthly due date in the contract.</p>}
                      {classified.kind === "ongoing" && <p className="deadline-extra">Ongoing requirement; it is not a one-time calendar deadline.</p>}
                    </div>
                    <div className="deadline-item-meta">
                      <span className={`deadline-status ${classified.kind}`}>{classified.label}</span>
                      <span className={`review-status-badge review-${item.review_status}`}>
                        {item.review_status === "pending" ? "Pending review" : item.review_status === "approved" ? "Approved" : "Rejected"}
                      </span>
                      <button type="button" className="secondary-button" onClick={() => { setActivePage("contracts"); void openSavedContract(item.contractId); }}>View contract</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <p className="deadline-note">Recurring monthly and ongoing wording is recognized separately from exact dates. Relative phrases such as “within 30 days” still need a confirmed start date before they can be calculated reliably.</p>
        </section>
      </>}
      <section className="dashboard-section">
        <h2>Upcoming Renewals</h2>
        <p>Contracts expiring or renewing within the next 730 days.</p>

        {renewalsLoading ? (
          <p>Loading renewal alerts...</p>
        ) : renewalAlerts.length === 0 ? (
          <p>No upcoming renewals found.</p>
        ) : (
          <div className="renewal-alert-list">
            {renewalAlerts.map((alert, index) => (
              <article
                className="renewal-alert-card"
                key={`${alert.contract_id}-${index}`}
              >
                <h3>{alert.filename}</h3>

                
                {alert.days_remaining < 0 ? (
                  <span className="renewal-status overdue">
                    Overdue
                  </span>
                ) : alert.days_remaining <= 30 ? (
                  <span className="renewal-status due-soon">
                    Due Soon
                  </span>
                ) : (
                  <span className="renewal-status upcoming">
                    Upcoming
                  </span>
                )}


                <p>
                  Renewal date: {alert.renewal_date || "Not specified"}
                </p>

                <p>
                  Expiry date: {alert.expiry_date || "Not specified"}
                </p>
                <p>
                  <strong>Alert date:</strong>{" "}
                  {alert.alert_date || alert.expiry_date || "Not specified"}
                </p>

                <p>
                  <strong>Days remaining:</strong>{" "}
                  {alert.days_remaining ?? "Not available"}
                </p>
                <p>
                  Notice period:{" "}
                  {alert.notice_period_days != null
                    ? `${alert.notice_period_days} days`
                    : "Not specified"}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    <section className="dashboard-section">
      <h2>Notice Deadlines</h2>
      <p>
        Preliminary reminders calculated from contract expiry dates
        and stored notice periods.
      </p>

      {noticeDeadlinesLoading ? (
        <p>Loading notice deadlines...</p>
      ) : noticeDeadlines.length === 0 ? (
        <p>No upcoming notice deadlines found.</p>
      ) : (
        <div className="renewal-alert-list">
          {noticeDeadlines.map((alert) => (
            
          <article
            className="renewal-alert-card notice-deadline-card"
            key={alert.contract_id}
          >

              <h3>{alert.filename}</h3>

              
              <span
                className={`renewal-status ${
                  alert.days_remaining <= 30
                    ? "due-soon"
                    : "upcoming"
                }`}
              >
                {alert.days_remaining <= 30
                  ? "Notice Due Soon"
                  : "Notice Upcoming"}
              </span>


              <p>
                <strong>Notice deadline:</strong>{" "}
                {alert.notice_deadline}
              </p>

              <p>
                <strong>Contract expiry:</strong>{" "}
                {alert.expiry_date}
              </p>

              <p>
                <strong>Notice period:</strong>{" "}
                {alert.notice_period_days} days
              </p>

              <p>
                {alert.days_remaining === 0
                  ? "Notice deadline is today!"
                  : `${alert.days_remaining} days remaining`}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>

      <section className="saved-contracts">

        <div className="section-heading">

          <div>

            <p className="eyebrow">YOUR WORKSPACE</p>

            <h3>Saved Contracts</h3>

            <p className="muted">

              Open contracts previously saved to your database.

            </p>

          </div>



          <button

            type="button"

            className="secondary-button"

            onClick={loadSavedContracts}

            disabled={contractsLoading}

          >

            {contractsLoading ? "Loading..." : "Refresh"}

          </button>

        </div>



        {activePage === "contracts" && (
          <div className="contract-filters">
            <label className="contract-search-box">
              <span aria-hidden="true">⌕</span>
              <input type="search" value={contractSearch} onChange={(event) => setContractSearch(event.target.value)} placeholder="Search contracts by filename..." aria-label="Search contracts by filename" />
            </label>
            <label className="contract-status-select">
              <span>Review status</span>
              <select value={contractStatusFilter} onChange={(event) => setContractStatusFilter(event.target.value as "all" | "pending" | "approved" | "rejected")} aria-label="Filter contracts by review status">
                <option value="all">All statuses</option>
                <option value="pending">Pending review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected items</option>
              </select>
            </label>
            {(contractSearch || contractStatusFilter !== "all") && <button type="button" className="secondary-button" onClick={() => { setContractSearch(""); setContractStatusFilter("all"); }}>Clear filters</button>}
          </div>
        )}

        {contractsLoading && savedContracts.length === 0 ? (

          <p className="muted">Loading saved contracts...</p>

        ) : savedContracts.length === 0 ? (

          <p className="muted">No saved contracts yet.</p>

        ) : filteredSavedContracts.length === 0 ? (
          <div className="empty-filter-results">
            <strong>No matching contracts</strong>
            <p className="muted">Try another filename or review status.</p>
            <button type="button" className="secondary-button" onClick={() => { setContractSearch(""); setContractStatusFilter("all"); }}>Clear filters</button>
          </div>

        ) : (

          <div className="saved-contract-list">

            {filteredSavedContracts.map((contract) => (



            <article

              className="insight-card"

              key={contract.id}

              onClick={() => openSavedContract(contract.id)}

              style={{ cursor: "pointer" }}

            >

              <div>

                <strong>{contract.filename}</strong>

                <p className="muted">

                  Contract #{contract.id} · {contract.obligations_count} obligations

                </p>
                {contractStatuses[contract.id] && contractStatuses[contract.id] !== "none" && (
                  <span className={`contract-status-pill status-${contractStatuses[contract.id]}`}>
                    {contractStatuses[contract.id] === "pending" ? "Pending review" : contractStatuses[contract.id] === "approved" ? "Approved" : "Rejected items"}
                  </span>
                )}

                <p className="muted">

                  Saved {new Date(contract.created_at).toLocaleString()}

                </p>

                <span className="success">Click to view details →</span>

              </div>

            </article>  

            ))}

          </div>

        )}

      </section>



      {contractDetailsLoading && (

        <p className="muted">Loading contract details...</p>

      )}



      {selectedContract && (

        <section className="analysis-results">

          <div className="result-heading">

            <div>

              <p className="eyebrow">SAVED CONTRACT #{selectedContract.id}</p>

              <h3>{selectedContract.filename}</h3>

              <p className="muted">

                {selectedContract.obligations.length} saved obligations

              </p>

            </div>



            <button

              type="button"

              className="secondary-button"

              onClick={() => setSelectedContract(null)}

            >

              Close details

            </button>

          </div>



          <section className="panel policy-compliance">
            <h3>Company Policy Compliance</h3>
            <p className="muted">Select company policies to compare against this saved contract.</p>
            <button type="button" className="secondary-button" onClick={loadPolicies}>Refresh policies</button>
            {policies.length === 0 ? <p className="muted">No policies loaded yet. Click Refresh policies.</p> : (
              <div className="policy-checkbox-list">
                {policies.map((policy) => <label key={policy.id} className="policy-checkbox-item" style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 12, border: "1px solid #dbe2f0", borderRadius: 8, marginTop: 8 }}>
                  <input type="checkbox" checked={selectedPolicyIds.includes(policy.id)} onChange={(event) => {
                    setSelectedPolicyIds((previous) => event.target.checked ? [...previous, policy.id] : previous.filter((id) => id !== policy.id));
                    setPolicyResult(null);
                  }} />
                  <span><strong>{policy.name}</strong><br /><span className="muted">{policy.description}</span></span>
                </label>)}
              </div>
            )}
            <button type="button" onClick={checkPolicyCompliance} disabled={policyChecking || selectedPolicyIds.length === 0} style={{ marginTop: 12 }}>
              {policyChecking ? "Checking compliance..." : "Check Policy Compliance"}
            </button>
            {policyError && <p className="error">{policyError}</p>}
            {policyResult && <div className="policy-results">
              <h4>Policy check results</h4>
              <p>Policies checked: {policyResult.checked_policy_ids?.length ?? 0}</p>
              {(() => {
                const mismatches = policyResult.result?.mismatches ?? [];
                return mismatches.length === 0 ? <p className="success">No potential policy conflicts were returned by the AI. Verify the contract manually.</p> : mismatches.map((item, index) => <article className="obligation-card" key={index}>
                  <strong>{item.policy || "Policy mismatch"}</strong>
                  {item.severity && <p><b>Severity:</b> {item.severity}</p>}
                  {item.contract_clause && <p><b>Contract clause:</b> {item.contract_clause}</p>}
                  {item.issue && <p><b>Issue:</b> {item.issue}</p>}
                  {item.reason && <p><b>Reason:</b> {item.reason}</p>}
                  {item.recommendation && <p><b>Recommendation:</b> {item.recommendation}</p>}
                </article>);
              })()}
              <p className="disclaimer">AI results may be incomplete. Verify potential conflicts against the original contract and company policy.</p>
            </div>}
          </section>
                        <div className="section-heading">
            <h3>Obligations and review status</h3>
            <span className="count">
              {selectedContract.obligations.length} obligations
            </span>
          </div>

          <div className="obligations-list">
            {selectedContract.obligations.map((obligation) => (
              <article className="obligation-card" key={obligation.id}>
                <div className="obligation-content">
                  <strong>{obligation.description}</strong>

                  <p className="muted">
                    Responsible party:{" "}
                    {obligation.responsible_party || "Not specified"}
                  </p>

                  <p className="muted">
                    Deadline: {obligation.deadline || "Not specified"}
                  </p>

                  <p className="evidence">
                    "{obligation.evidence}"
                  </p>

                  <span
                    className={`review-status-badge review-${obligation.review_status}`}
                  >
                    {obligation.review_status === "pending"
                      ? "Pending review"
                      : obligation.review_status === "approved"
                        ? "Approved"
                        : "Rejected"}
                  </span>

                  <div className="review-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void editSavedObligation(obligation)}
                    >
                      Edit obligation
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void updateSavedObligationStatus(
                          obligation.id,
                          "approved"
                        )
                      }
                      disabled={obligation.review_status === "approved"}
                    >
                      Approve
                    </button>

                    <button
                      type="button"
                      className="reject-button"
                      onClick={() =>
                        void updateSavedObligationStatus(
                          obligation.id,
                          "rejected"
                        )
                      }
                      disabled={obligation.review_status === "rejected"}
                    >
                      Reject
                    </button>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        void updateSavedObligationStatus(
                          obligation.id,
                          "pending"
                        )
                      }
                      disabled={obligation.review_status === "pending"}
                    >
                      Set Pending
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <section className="dashboard-section version-history-section">
            <h3>Version History</h3>
            <p className="muted">Review previously saved contract text and the obligations captured for each version.</p>
            {versionsLoading ? <p className="muted">Loading version history...</p> : versionsError ? <p className="error">{versionsError}</p> : contractVersions.length === 0 ? <p className="muted">No version history available for this contract.</p> : (
              <div className="renewal-alert-list">
                {contractVersions.slice().sort((a, b) => b.version_number - a.version_number).map((version) => (
                  <article className="renewal-alert-card" key={version.id}>
                    <h4>Version {version.version_number}</h4>
                    <p><strong>File:</strong> {version.filename}</p>
                    <p><strong>Saved:</strong> {new Date(version.created_at).toLocaleString()}</p>
                    <details>
                      <summary>View saved contract text</summary>
                      <pre className="version-contract-text">{version.contract_text}</pre>
                    </details>
                    <button type="button" className="secondary-button" style={{ marginTop: 12 }} disabled={versionObligationsLoading === version.version_number} onClick={() => {
                      if (versionObligations[version.version_number]) {
                        setVersionObligations((previous) => { const next = { ...previous }; delete next[version.version_number]; return next; });
                      } else {
                        void loadVersionObligations(selectedContract.id, version.version_number);
                      }
                    }}>
                      {versionObligationsLoading === version.version_number ? "Loading obligations..." : versionObligations[version.version_number] ? "Hide saved obligations" : "View saved obligations"}
                    </button>
                    {versionObligationsError && versionObligationsLoading === null && <p className="error">{versionObligationsError}</p>}
                    {versionObligations[version.version_number] && (
                      <div className="obligations-list version-obligations-list">
                        {versionObligations[version.version_number].length === 0 ? <p className="muted">No obligations were saved for this version.</p> : versionObligations[version.version_number].map((obligation) => (
                          <article className="obligation-card" key={obligation.id}>
                            <strong>{obligation.description}</strong>
                            <p className="muted">Responsible party: {obligation.responsible_party || "Not specified"}</p>
                            <p className="muted">Deadline: {obligation.deadline || "Not specified"}</p>
                            <p className="evidence">"{obligation.evidence}"</p>
                            <span className={`review-status-badge review-${obligation.review_status}`}>{obligation.review_status === "pending" ? "Pending review" : obligation.review_status === "approved" ? "Approved" : "Rejected"}</span>
                          </article>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

        </section>

      )}



      </>}

      {activePage === "analyze" && text && (

        <section className="panel result">

          <div className="result-heading">

            <div>

              <p className="eyebrow">EXTRACTION COMPLETE</p>

              <h3>{filename}</h3>

            </div>

            <span className="success">Text extracted</span>

          </div>



          <p className="muted">

            {text.length.toLocaleString()} characters extracted

          </p>



          <label htmlFor="contract-text">Extracted contract text</label>

          <textarea

            id="contract-text"

            value={text}

            onChange={(event) => {

              setText(event.target.value);

              setAnalysis(null);

            }}

            rows={10}

          />



          <p className="muted">

            Review or edit the extracted text before analyzing it.

          </p>



          <button onClick={handleAnalyze} disabled={analyzing || loading}>

            {analyzing ? "Analyzing contract..." : "Analyze contract"}

          </button>



          {error && <p className="error">{error}</p>}



          {analyzing && (

            <p className="muted">

              Reviewing the contract. This may take a moment.

            </p>

          )}



          {analysis && (

            <section className="analysis-results">

              <button

                type="button"

                onClick={handleSaveContract}

                className="primary-button"

              >

                Save to Database

              </button>



              <div className="result-heading">

                <div>

                  <p className="eyebrow">CONTRACT INTELLIGENCE</p>

                  <h3>Contract analysis</h3>

                  <p className="muted">

                    Review extracted details and their supporting evidence.

                  </p>

                </div>

                <span className="success">Analysis complete</span>

              </div>



              <h3>Contract parties</h3>

              <div className="analysis-grid">

                {(analysis.parties ?? []).map((party, index) => (

                  <article className="insight-card" key={index}>

                    <p className="muted">Party {index + 1}</p>

                    <strong>{party.name || "Not identified"}</strong>

                    {party.evidence && (

                      <p className="evidence">"{party.evidence}"</p>

                    )}

                  </article>

                ))}

              </div>



              <h3>Key terms</h3>

              <div className="analysis-grid">

                {analysisFields.map(({ label, item }) => (

                  <article className="insight-card" key={label}>

                    <p className="muted">{label}</p>

                    <strong>{item?.value || "Not specified"}</strong>

                    {item?.evidence && (

                      <p className="evidence">"{item.evidence}"</p>

                    )}

                  </article>

                ))}

              </div>



              <div className="section-heading">

                <h3>Obligations</h3>

                <span className="count">{reviewedObligations.length}</span>

              </div>



              <div className="review-summary">

                <div className="summary-card pending-card">

                  <span>Pending review</span>

                  <strong>

                    {

                      reviewedObligations.filter(

                        (item) => item.reviewStatus === "pending",

                      ).length

                    }

                  </strong>

                </div>



                <div className="summary-card approved-card">

                  <span>Approved</span>

                  <strong>

                    {

                      reviewedObligations.filter(

                        (item) => item.reviewStatus === "approved",

                      ).length

                    }

                  </strong>

                </div>



                <div className="summary-card rejected-card">

                  <span>Rejected</span>

                  <strong>

                    {

                      reviewedObligations.filter(

                        (item) => item.reviewStatus === "rejected",

                      ).length

                    }

                  </strong>

                </div>

              </div>



              {reviewedObligations.length > 0 ? (

                <div className="obligations-list">

                  {reviewedObligations.map((obligation, index) => (

                    <article className="obligation-card" key={index}>

                      <div className="obligation-number">{index + 1}</div>



                      <div className="obligation-content">

                        <strong>{obligation.description}</strong>



                        <p className="muted">

                          Responsible party:{" "}

                          {obligation.responsible_party || "Not specified"}

                        </p>



                        <p className="muted">

                          Deadline: {obligation.deadline || "Not specified"}

                        </p>



                        {obligation.evidence && (

                          <p className="evidence">

                            Evidence: "{obligation.evidence}"

                          </p>

                        )}



                        <p className="review-status">

                          Status:{" "}

                          {obligation.reviewStatus === "pending"

                            ? "Pending review"

                            : obligation.reviewStatus === "approved"

                              ? "Approved"

                              : "Rejected"}

                        </p>



                        <div className="review-actions">

                          <button

                            onClick={async () => {

                              const saved = await saveObligationReview(

                                obligation.id!,

                                "approved",

                              );



                              if (saved) {

                                updateObligation(index, {

                                  reviewStatus: "approved",

                                });

                              }

                            }}

                            disabled={!obligation.id || obligation.reviewStatus === "approved"}

                          >

                            Approve

                          </button>



                          <button

                            className="secondary-button"

                            onClick={() => editObligation(index)}

                          >

                            Edit

                          </button>



                          <button

                            className="reject-button"

                            onClick={async () => {

                              const saved = await saveObligationReview(

                                obligation.id!,

                                "rejected",

                              );



                              if (saved) {

                                updateObligation(index, {

                                  reviewStatus: "rejected",

                                });

                              }

                            }}

                            disabled={!obligation.id || obligation.reviewStatus === "rejected"}

                          >

                            Reject

                          </button>

                        </div>

                      </div>

                    </article>

                  ))}

                </div>

              ) : (

                <p className="muted">No obligations were identified.</p>

              )}



              <h3>Items needing review</h3>

              {analysis.uncertainties?.length ? (

                <ul className="uncertainty-list">

                  {analysis.uncertainties.map((item, index) => (

                    <li key={index}>{item}</li>

                  ))}

                </ul>

              ) : (

                <p className="muted">

                  No uncertainties were returned by the AI. This does not

                  guarantee that the contract contains no ambiguities.

                </p>

              )}



              <p className="disclaimer">

                AI-generated extraction may be incomplete or inaccurate. Verify

                important details against the original contract. This tool does

                not provide legal advice.

              </p>

            </section>

          )}

        </section>

      )}



      {activePage === "policies" && <PolicyManager />}
      {activePage === "settings" && <section className="panel"><h2>Settings</h2><p className="muted">The app uses your configured backend and AI service to analyze contracts.</p><p><strong>Review reminder:</strong> Always verify extracted information against the original contract.</p><p className="disclaimer">This tool supports contract review and does not provide legal advice.</p></section>}
      <footer>Contract Assistant · For review support, not legal advice.</footer>
      </main>
    </div>
  );

}



export default App;
