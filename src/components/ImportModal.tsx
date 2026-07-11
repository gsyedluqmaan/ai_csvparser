"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  CheckCircle2,
  AlertCircle,
  Download,
  Loader2,
  RotateCw,
} from "lucide-react";

export type CsvRow = Record<string, string>;

export type ImportedRecord = {
  created_at: string;
  name: string;
  email: string;
  country_code: string;
  mobile_without_country_code: string;
  company: string;
  city: string;
  state: string;
  country: string;
  lead_owner: string;
  crm_status: string;
  crm_note: string;
  data_source: string;
  possession_time: string;
  description: string;
};

export type SkippedRecord = {
  original: Record<string, unknown>;
  reason: string;
};

export type ImportApiResponse = {
  totalRows: number;
  totalImported: number;
  totalSkipped: number;
  imported: ImportedRecord[];
  skipped: SkippedRecord[];
};

type ImportProgress = {
  totalBatches: number;
  batchSize: number;
  currentBatch: number;
  completedBatches: number;
  failedBatches: number;
};

type ModalStage = "preview" | "importing" | "result";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const AI_FAILURE_PREFIX = "AI processing failed:";

const IMPORTED_COLUMNS: { key: keyof ImportedRecord; label: string }[] = [
  { key: "created_at", label: "Created At" },
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "country_code", label: "Code" },
  { key: "mobile_without_country_code", label: "Mobile" },
  { key: "company", label: "Company" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "country", label: "Country" },
  { key: "lead_owner", label: "Owner" },
  { key: "crm_status", label: "Status" },
  { key: "crm_note", label: "Note" },
  { key: "data_source", label: "Source" },
  { key: "possession_time", label: "Possession" },
  { key: "description", label: "Description" },
];

const STATUS_STYLES: Record<string, string> = {
  GOOD_LEAD_FOLLOW_UP:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20",
  DID_NOT_CONNECT:
    "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20",
  BAD_LEAD:
    "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20",
  SALE_DONE:
    "bg-teal-50 text-teal-700 ring-teal-600/20 dark:bg-teal-500/10 dark:text-teal-400 dark:ring-teal-500/20",
};

function Cell({ value, width }: { value: string; width: number }) {
  const display = value && value.trim() !== "" ? value : "—";
  return (
    <div
      title={display}
      style={{ width }}
      className="truncate text-[13px] text-slate-600 dark:text-slate-300"
    >
      {display}
    </div>
  );
}

function downloadCsv(records: ImportedRecord[], fileName: string) {
  const headers = IMPORTED_COLUMNS.map((c) => c.key);
  const escape = (v: string) => `"${(v || "").replace(/"/g, '""')}"`;
  const lines = [
    headers.join(","),
    ...records.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName.replace(/\.[^/.]+$/, "")}_mapped.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Reads a fetch Response whose body is a Server-Sent Events stream and
 * invokes the matching handler for each event type. Hand-rolled because the
 * native EventSource API only supports GET requests, and this needs POST.
 */
async function consumeSseStream(
  response: Response,
  handlers: {
    onMeta?: (data: {
      totalRows: number;
      totalBatches: number;
      batchSize: number;
    }) => void;
    onProgress?: (data: {
      stage: "start" | "done" | "failed";
      batchIndex: number;
      totalBatches: number;
      batchSize: number;
      error?: string;
    }) => void;
    onResult?: (data: ImportApiResponse) => void;
    onError?: (data: { message: string }) => void;
  },
) {
  if (!response.body) throw new Error("Response has no readable body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";

    for (const chunk of chunks) {
      if (!chunk.trim() || chunk.startsWith(":")) continue;

      const eventMatch = chunk.match(/^event:\s*(.+)$/m);
      const dataMatch = chunk.match(/^data:\s*(.+)$/m);
      if (!eventMatch || !dataMatch) continue;

      const eventType = eventMatch[1].trim();
      const data = JSON.parse(dataMatch[1]);

      if (eventType === "meta") handlers.onMeta?.(data);
      else if (eventType === "progress") handlers.onProgress?.(data);
      else if (eventType === "result") handlers.onResult?.(data);
      else if (eventType === "error") handlers.onError?.(data);
    }
  }
}

function ProgressPanel({ progress }: { progress: ImportProgress | null }) {
  return (
    <motion.div
      key="progress-panel"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex h-full flex-col items-center justify-center gap-5 py-16 sm:py-24"
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:ring-emerald-500/20"
      >
        <Loader2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
      </motion.div>

      <div className="text-center px-4">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Mapping your data with AI…
        </p>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          {progress
            ? `Batch ${progress.currentBatch} of ${progress.totalBatches} · ${progress.batchSize} rows per batch`
            : "Starting up…"}
        </p>
      </div>

      {progress && (
        <div className="w-full max-w-xs px-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <motion.div
              className="h-full rounded-full bg-emerald-500"
              initial={{ width: 0 }}
              animate={{
                width: `${(progress.completedBatches / progress.totalBatches) * 100}%`,
              }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
            <span>{progress.completedBatches} completed</span>
            {progress.failedBatches > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                {progress.failedBatches} retrying/failed
              </span>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function StatChip({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "neutral" | "success" | "warning";
  icon?: React.ReactNode;
}) {
  const toneStyles = {
    neutral:
      "bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
    success:
      "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20",
    warning:
      "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20",
  }[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ${toneStyles}`}
    >
      {icon}
      {label}: <span className="font-semibold">{value}</span>
    </span>
  );
}

export default function ImportModal({
  open,
  onClose,
  onReset,
  file,
  fileName,
  rows,
  columns,
}: {
  open: boolean;
  onClose: () => void;
  onReset: () => void;
  file: File | null;
  fileName: string;
  rows: CsvRow[];
  columns: string[];
}) {
  const [stage, setStage] = useState<ModalStage>("preview");
  const [importError, setImportError] = useState("");
  const [result, setResult] = useState<ImportApiResponse | null>(null);
  const [resultView, setResultView] = useState<"imported" | "skipped">(
    "imported",
  );
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const closeModal = useCallback(() => {
    if (stage === "importing" || isRetrying) return; // don't close mid-request
    onClose();
  }, [stage, isRetrying, onClose]);

  const runImport = useCallback(async (formData: FormData) => {
    const response = await fetch(`${API_BASE_URL}/api/import`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(
        body?.message || body?.error || `Import failed (${response.status})`,
      );
    }

    return response;
  }, []);

  const handleConfirmImport = useCallback(async () => {
    if (!file) return;
    setStage("importing");
    setImportError("");
    setProgress(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await runImport(formData);

      await consumeSseStream(response, {
        onMeta: (data) =>
          setProgress({
            totalBatches: data.totalBatches,
            batchSize: data.batchSize,
            currentBatch: 0,
            completedBatches: 0,
            failedBatches: 0,
          }),
        onProgress: (data) =>
          setProgress((prev) => {
            const base = prev ?? {
              totalBatches: data.totalBatches,
              batchSize: data.batchSize,
              currentBatch: 0,
              completedBatches: 0,
              failedBatches: 0,
            };
            return {
              ...base,
              currentBatch: data.batchIndex,
              completedBatches:
                data.stage === "done"
                  ? base.completedBatches + 1
                  : base.completedBatches,
              failedBatches:
                data.stage === "failed"
                  ? base.failedBatches + 1
                  : base.failedBatches,
            };
          }),
        onResult: (data) => {
          setResult(data);
          setResultView("imported");
          setStage("result");
        },
        onError: (data) => {
          throw new Error(data.message || "Import failed");
        },
      });
    } catch (err) {
      setImportError(
        err instanceof Error
          ? err.message
          : "Something went wrong during import.",
      );
      setStage("preview");
    }
  }, [file, runImport]);

  // Retries ONLY the rows that were skipped because their AI batch failed —
  // not rows skipped for legitimate reasons like "no email or mobile".
  const handleRetryFailed = useCallback(async () => {
    if (!result) return;

    const failedItems = result.skipped.filter((item) =>
      item.reason.startsWith(AI_FAILURE_PREFIX),
    );
    if (failedItems.length === 0) return;

    setIsRetrying(true);
    setImportError("");
    setProgress(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/import/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: failedItems.map((item) => item.original),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.message || body?.error || `Retry failed (${response.status})`,
        );
      }

      await consumeSseStream(response, {
        onMeta: (data) =>
          setProgress({
            totalBatches: data.totalBatches,
            batchSize: data.batchSize,
            currentBatch: 0,
            completedBatches: 0,
            failedBatches: 0,
          }),
        onProgress: (data) =>
          setProgress((prev) => {
            const base = prev ?? {
              totalBatches: data.totalBatches,
              batchSize: data.batchSize,
              currentBatch: 0,
              completedBatches: 0,
              failedBatches: 0,
            };
            return {
              ...base,
              currentBatch: data.batchIndex,
              completedBatches:
                data.stage === "done"
                  ? base.completedBatches + 1
                  : base.completedBatches,
              failedBatches:
                data.stage === "failed"
                  ? base.failedBatches + 1
                  : base.failedBatches,
            };
          }),
        onResult: (retryData) => {
          setResult((prev) => {
            if (!prev) return prev;
            const remainingSkipped = prev.skipped.filter(
              (item) => !item.reason.startsWith(AI_FAILURE_PREFIX),
            );
            const mergedImported = [...prev.imported, ...retryData.imported];
            const mergedSkipped = [...remainingSkipped, ...retryData.skipped];
            return {
              totalRows: prev.totalRows,
              totalImported: mergedImported.length,
              totalSkipped: mergedSkipped.length,
              imported: mergedImported,
              skipped: mergedSkipped,
            };
          });
        },
        onError: (data) => {
          throw new Error(data.message || "Retry failed");
        },
      });
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Retry failed. Please try again.",
      );
    } finally {
      setIsRetrying(false);
      setProgress(null);
    }
  }, [result]);

  const failedCount =
    result?.skipped.filter((item) => item.reason.startsWith(AI_FAILURE_PREFIX))
      .length ?? 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-2 backdrop-blur-sm dark:bg-black/50 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <motion.div
            layout
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5 dark:bg-slate-900 dark:ring-white/10 sm:h-auto sm:max-h-[85vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:px-6 sm:py-4">
              <div className="min-w-0">
                <h2 className="truncate text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                  {stage === "result"
                    ? "Import result"
                    : "Review before import"}
                </h2>
                <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                  {stage === "result"
                    ? `${fileName} · processed`
                    : `${fileName} · ${rows.length} rows detected`}
                </p>
              </div>
              {stage !== "importing" && !isRetrying && (
                <button
                  onClick={closeModal}
                  className="ml-2 shrink-0 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-hidden">
              <AnimatePresence mode="wait">
                {stage === "preview" && (
                  <motion.div
                    key="preview"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex h-full flex-col"
                  >
                    {importError && (
                      <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 ring-1 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20 sm:mx-6">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        {importError}
                      </div>
                    )}
                    <div
                      className="mx-4 mt-4 overflow-auto rounded-xl border border-slate-100 dark:border-slate-800 sm:mx-6"
                      style={{ maxHeight: "55vh" }}
                    >
                      <table
                        className="w-full border-collapse text-left text-sm"
                        style={{ tableLayout: "fixed" }}
                      >
                        <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/60">
                          <tr>
                            {columns.map((col) => (
                              <th
                                key={col}
                                style={{ width: 180 }}
                                className="border-b border-slate-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400"
                              >
                                <div className="truncate" title={col}>
                                  {col}
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, i) => (
                            <tr
                              key={i}
                              className="odd:bg-white even:bg-slate-50/50 hover:bg-emerald-50/40 dark:odd:bg-slate-900 dark:even:bg-slate-800/30 dark:hover:bg-emerald-500/5"
                            >
                              {columns.map((col) => (
                                <td
                                  key={col}
                                  className="border-b border-slate-50 px-4 py-2.5 dark:border-slate-800/60"
                                >
                                  <Cell value={row[col] ?? ""} width={148} />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}

                {stage === "importing" && <ProgressPanel progress={progress} />}

                {stage === "result" && result && (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex h-full flex-col"
                  >
                    {isRetrying ? (
                      <ProgressPanel progress={progress} />
                    ) : (
                      <>
                        {importError && (
                          <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 ring-1 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20 sm:mx-6">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            {importError}
                          </div>
                        )}

                        <div className="mx-4 mt-4 flex flex-wrap items-center gap-2 sm:mx-6">
                          <div className="inline-flex w-fit rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800 sm:mx-6">
                            {(["imported", "skipped"] as const).map((v) => (
                              <button
                                key={v}
                                onClick={() => setResultView(v)}
                                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                                  resultView === v
                                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                                }`}
                              >
                                {v === "imported"
                                  ? `Imported (${result.totalImported})`
                                  : `Skipped (${result.totalSkipped})`}
                              </button>
                            ))}
                          </div>

                          <div className="ml-0 flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
                            {failedCount > 0 && (
                              <button
                                onClick={handleRetryFailed}
                                className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20"
                              >
                                <RotateCw className="h-3.5 w-3.5" /> Retry{" "}
                                {failedCount} failed
                              </button>
                            )}
                            <button
                              onClick={() =>
                                downloadCsv(result.imported, fileName)
                              }
                              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              <Download className="h-3.5 w-3.5" /> Download
                              mapped CSV
                            </button>
                          </div>
                        </div>

                        <div
                          className="mx-4 mb-4 mt-3 overflow-auto rounded-xl border border-slate-100 dark:border-slate-800 sm:mx-6 sm:mb-6"
                          style={{ maxHeight: "48vh" }}
                        >
                          {resultView === "imported" ? (
                            <table
                              className="w-full border-collapse text-left text-sm"
                              style={{ tableLayout: "fixed" }}
                            >
                              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/60">
                                <tr>
                                  {IMPORTED_COLUMNS.map((col) => (
                                    <th
                                      key={col.key}
                                      style={{ width: 150 }}
                                      className="border-b border-slate-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400"
                                    >
                                      <div className="truncate">
                                        {col.label}
                                      </div>
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {result.imported.length ? (
                                  result.imported.map((rec, i) => (
                                    <tr
                                      key={i}
                                      className="odd:bg-white even:bg-slate-50/50 hover:bg-emerald-50/40 dark:odd:bg-slate-900 dark:even:bg-slate-800/30 dark:hover:bg-emerald-500/5"
                                    >
                                      {IMPORTED_COLUMNS.map((col) => (
                                        <td
                                          key={col.key}
                                          className="border-b border-slate-50 px-4 py-2.5 dark:border-slate-800/60"
                                        >
                                          {col.key === "crm_status" &&
                                          rec.crm_status ? (
                                            <span
                                              className={`inline-block truncate rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                                                STATUS_STYLES[rec.crm_status] ||
                                                "bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
                                              }`}
                                              style={{ maxWidth: 130 }}
                                              title={rec.crm_status}
                                            >
                                              {rec.crm_status.replace(
                                                /_/g,
                                                " ",
                                              )}
                                            </span>
                                          ) : (
                                            <Cell
                                              value={rec[col.key]}
                                              width={120}
                                            />
                                          )}
                                        </td>
                                      ))}
                                    </tr>
                                  ))
                                ) : (
                                  <tr>
                                    <td className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                                      No records were imported.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          ) : (
                            <table
                              className="w-full border-collapse text-left text-sm"
                              style={{ tableLayout: "fixed" }}
                            >
                              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/60">
                                <tr>
                                  <th
                                    style={{ width: 220 }}
                                    className="border-b border-slate-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400"
                                  >
                                    Reason
                                  </th>
                                  <th className="border-b border-slate-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                    Original row
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {result.skipped.length ? (
                                  result.skipped.map((item, i) => (
                                    <tr
                                      key={i}
                                      className="odd:bg-white even:bg-slate-50/50 dark:odd:bg-slate-900 dark:even:bg-slate-800/30"
                                    >
                                      <td className="border-b border-slate-50 px-4 py-2.5 align-top dark:border-slate-800/60">
                                        <span
                                          className={`inline-flex items-center gap-1 text-xs font-medium ${
                                            item.reason.startsWith(
                                              AI_FAILURE_PREFIX,
                                            )
                                              ? "text-rose-600 dark:text-rose-400"
                                              : "text-amber-700 dark:text-amber-400"
                                          }`}
                                        >
                                          <AlertCircle className="h-3 w-3" />{" "}
                                          {item.reason}
                                        </span>
                                      </td>
                                      <td className="border-b border-slate-50 px-4 py-2.5 align-top dark:border-slate-800/60">
                                        <div
                                          className="truncate font-mono text-xs text-slate-400 dark:text-slate-500"
                                          title={JSON.stringify(item.original)}
                                        >
                                          {JSON.stringify(item.original)}
                                        </div>
                                      </td>
                                    </tr>
                                  ))
                                ) : (
                                  <tr>
                                    <td
                                      colSpan={2}
                                      className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500"
                                    >
                                      Nothing was skipped.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            {stage !== "importing" && !isRetrying && (
              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800 sm:flex-row sm:justify-end sm:px-6 sm:py-4">
                {stage === "preview" && (
                  <>
                    <button
                      onClick={closeModal}
                      className="w-full rounded-lg px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800 sm:w-auto"
                    >
                      Cancel
                    </button>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={handleConfirmImport}
                      className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 sm:w-auto"
                    >
                      Confirm import
                    </motion.button>
                  </>
                )}
                {stage === "result" && (
                  <>
                    <button
                      onClick={onReset}
                      className="w-full rounded-lg px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800 sm:w-auto"
                    >
                      Import another file
                    </button>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={closeModal}
                      className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 sm:w-auto"
                    >
                      Done
                    </motion.button>
                  </>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
