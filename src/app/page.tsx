"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import Papa from "papaparse";
import { motion } from "framer-motion";
import {
  UploadCloud,
  FileSpreadsheet,
  ArrowRight,
  Loader2,
  Moon,
  Sun,
} from "lucide-react";
import ImportModal, { type CsvRow } from "@/components/ImportModal";

export default function CsvImporterPage() {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Bumped every time a genuinely new file is loaded. Passed as ImportModal's
  // React `key`, which forces a full unmount+remount of the modal — this is
  // what actually resets its internal state (stage, result, retry flags,
  // etc). Without this, ImportModal never unmounts between files, so
  // "Import another file" would keep showing the previous file's result.
  const [importSessionId, setImportSessionId] = useState(0);

  // Dark mode: toggled by class on <html>. Defaults to LIGHT regardless of
  // OS preference — only an explicit prior choice (stored in localStorage)
  // will start the app in dark mode.
  // IMPORTANT: tailwind.config.js must have `darkMode: 'class'` set, or the
  // `dark:` classes throughout this app will never take effect no matter
  // what class is on <html>.
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const shouldUseDark = stored === "dark";
    setIsDark(shouldUseDark);
    document.documentElement.classList.toggle("dark", shouldUseDark);
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("theme", next ? "dark" : "light");
      return next;
    });
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selected = acceptedFiles[0];
    if (!selected) return;

    setParseError("");
    setIsParsing(true);
    setFileName(selected.name);
    setFile(selected);

    Papa.parse<CsvRow>(selected, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedRows = (results.data || []).filter((row) =>
          Object.values(row).some((v) => String(v ?? "").trim() !== ""),
        );
        const detectedColumns =
          results.meta.fields || Object.keys(parsedRows[0] || {});
        setColumns(detectedColumns);
        setRows(parsedRows);
        setIsParsing(false);
        setModalOpen(true);
        setImportSessionId((id) => id + 1);
      },
      error: (err) => {
        setParseError(err.message || "Failed to parse CSV file.");
        setColumns([]);
        setRows([]);
        setIsParsing(false);
      },
    });
  }, []);

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject,
    open,
    fileRejections,
  } = useDropzone({
    onDrop,
    noClick: true,
    multiple: false,
    accept: { "text/csv": [".csv"], "application/vnd.ms-excel": [".csv"] },
  });

  const rejectionMessage = useMemo(() => {
    if (!fileRejections.length) return "";
    return (
      fileRejections[0]?.errors?.[0]?.message || "Only CSV files are allowed."
    );
  }, [fileRejections]);

  const resetAll = useCallback(() => {
    setModalOpen(false);
    setFile(null);
    setFileName("");
    setColumns([]);
    setRows([]);
    setImportSessionId((id) => id + 1);
  }, []);

  return (
    <main className="min-h-screen bg-[#FAFAF9] text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <button
        onClick={toggleTheme}
        aria-label="Toggle dark mode"
        className="fixed right-4 top-4 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-slate-100 sm:right-6 sm:top-6"
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-8 px-4 py-16 sm:gap-10 sm:px-6 sm:py-20">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            CRM Lead Importer
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
            Any CSV. Same clean CRM.
          </h1>
          <p className="max-w-md text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
            Drop a lead export from anywhere — Facebook, Google Ads, a
            spreadsheet — and let AI map it to your schema.
          </p>
        </div>

        <div
          {...getRootProps()}
          className={`group w-full max-w-xl cursor-pointer rounded-2xl border-2 border-dashed bg-white p-8 text-center transition-all dark:bg-slate-900 sm:p-12 ${
            isDragReject
              ? "border-rose-300 bg-rose-50/50 dark:border-rose-500/40 dark:bg-rose-500/5"
              : isDragActive
                ? "border-emerald-400 bg-emerald-50/50 dark:border-emerald-500/50 dark:bg-emerald-500/5"
                : "border-slate-200 hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:hover:border-slate-600"
          }`}
        >
          <input {...getInputProps()} />
          <div className="mx-auto flex max-w-sm flex-col items-center gap-4">
            <motion.div
              animate={isDragActive ? { scale: 1.08 } : { scale: 1 }}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-50 text-slate-400 ring-1 ring-slate-100 group-hover:text-emerald-500 dark:bg-slate-800 dark:text-slate-500 dark:ring-slate-700"
            >
              <UploadCloud className="h-6 w-6" strokeWidth={1.75} />
            </motion.div>

            <div className="space-y-1">
              <p className="text-[15px] font-medium text-slate-800 dark:text-slate-200">
                {isDragActive ? "Drop it here" : "Drag & drop your CSV"}
              </p>
              <p className="text-sm text-slate-400 dark:text-slate-500">
                or click below to browse
              </p>
            </div>

            <button
              type="button"
              onClick={open}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              Choose file
            </button>

            {isParsing && (
              <p className="flex items-center gap-1.5 text-sm text-slate-400 dark:text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading file…
              </p>
            )}
            {parseError && (
              <p className="text-sm text-rose-500 dark:text-rose-400">
                {parseError}
              </p>
            )}
            {rejectionMessage && (
              <p className="text-sm text-rose-500 dark:text-rose-400">
                {rejectionMessage}
              </p>
            )}
          </div>
        </div>

        {fileName && !modalOpen && (
          <motion.button
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setModalOpen(true)}
            className="flex w-full max-w-xl items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 shadow-sm transition hover:border-slate-300 hover:shadow dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 sm:w-auto"
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
            <span className="truncate font-medium text-slate-800 dark:text-slate-200">
              {fileName}
            </span>
            <span className="hidden text-slate-300 dark:text-slate-600 sm:inline">
              ·
            </span>
            <span className="hidden sm:inline">{rows.length} rows</span>
            <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500 sm:ml-1" />
          </motion.button>
        )}
      </div>

      <ImportModal
        key={importSessionId}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onReset={resetAll}
        file={file}
        fileName={fileName}
        rows={rows}
        columns={columns}
      />
    </main>
  );
}
