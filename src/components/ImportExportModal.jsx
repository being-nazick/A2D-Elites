import React, { useState, useCallback, useRef } from "react";
import { Download, Upload, CheckCircle, X, AlertCircle } from "lucide-react";
import { C } from "../app/constants";
import { mergeBackupData } from "./importExportUtils";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Dialog } from "@capacitor/dialog";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";

export default function ImportExportModal({ isOpen, onClose, data, setData }) {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success'|'error', message }
  const fileInputRef = useRef(null);
  const importModeRef = useRef("replace");

  const dismissStatus = () => setStatus(null);

  const exportData = useCallback(async () => {
    try {
      setExporting(true);
      setStatus(null);

      const exportPayload = {
        exportedAt: new Date().toISOString(),
        version: "1.0",
        data,
      };

      const jsonString = JSON.stringify(exportPayload, null, 2);
      const filename = `dairy-app-backup-${new Date().toISOString().slice(0,10)}.json`;

      if (Capacitor.isNativePlatform()) {
        // 1. Write to cache directory first (temporary storage safe for sharing)
        const fileResult = await Filesystem.writeFile({
          path: filename,
          data: jsonString,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });
        
        // 2. Trigger native OS share sheet (AirDrop, WhatsApp, Drive, Email, etc.)
        await Share.share({
          title: "App Backup",
          text: "Here is your dairy app data backup file.",
          url: fileResult.uri,
          dialogTitle: "Share Backup",
        });
        
        setStatus({ type: "success", message: "Backup ready to share" });
      } else {
        // Web fallback
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus({ type: "success", message: "Backup downloaded" });
      }
    } catch (error) {
      console.error("Export error:", error);
      setStatus({ type: "error", message: "Export failed: " + error.message });
    } finally {
      setExporting(false);
    }
  }, [data]);

  const handleFileInput = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setImporting(true);
      setStatus(null);

      const text = await file.text();
      const parsed = JSON.parse(text);

      const collections = ["products", "customers", "orders", "recurring"];
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !parsed.data ||
        typeof parsed.data !== "object" ||
        collections.some((key) => !Array.isArray(parsed.data[key])) ||
        (parsed.data.deliveryBoys !== undefined &&
          !Array.isArray(parsed.data.deliveryBoys))
      ) {
        throw new Error("Invalid backup file format");
      }

      const confirm = await Dialog.confirm({
        title: "Import Data",
        message:
          importModeRef.current === "merge"
            ? "Merge this backup with current data? Duplicate customers and orders will be skipped. Orders linked by customer ID are retained if their phone differs and flagged for review."
            : "This will replace all current app data. Continue?",
        okButtonTitle: importModeRef.current === "merge" ? "Merge" : "Replace",
        cancelButtonTitle: "Cancel",
      });

      if (!confirm.value) return;

      if (importModeRef.current === "merge") {
        const { data: mergedData, stats } = mergeBackupData(data, parsed.data);
        setData(mergedData);
        setStatus({
          type: "success",
          message: `Data merged. Removed ${stats.duplicateCustomerCount} duplicate customer(s) and ${stats.duplicateOrderCount} duplicate order(s); flagged ${stats.phoneMismatchCount} phone mismatch(es) for review and skipped ${stats.invalidOrderCount} order(s) without a matching customer ID or phone.`,
        });
      } else {
        setData(parsed.data);
        setStatus({ type: "success", message: "Data imported successfully" });
      }
    } catch (error) {
      console.error("Import error:", error);
      setStatus({ type: "error", message: "Import failed: " + error.message });
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,15,10,0.5)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        boxSizing: "border-box",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: C.bg,
          borderRadius: 20,
          width: "100%",
          maxWidth: 420,
          maxHeight: "85vh",
          overflow: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 20px 12px",
            borderBottom: `1px solid ${C.paperLine}`,
            background: C.paper,
          }}
        >
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 600 }}>
            Import / Export
          </div>
          <button
            className="tap"
            onClick={onClose}
            style={{
              border: "none",
              background: C.cream,
              borderRadius: 10,
              width: 30,
              height: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ fontSize: 11.5, color: C.inkMute, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>
            Backup & Restore
          </div>

          {/* Export */}
          <button
            className="tap"
            onClick={exportData}
            disabled={exporting}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: C.paper,
              border: `1px solid ${C.paperLine}`,
              borderRadius: 14,
              padding: "14px 16px",
              marginBottom: 10,
              fontSize: 14,
              fontWeight: 600,
              color: C.ink,
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Download size={18} color={C.primary} />
              <span>Export Data (JSON)</span>
            </div>
            {exporting && <span style={{ fontSize: 11, color: C.inkMute }}>Exporting...</span>}
          </button>

          {/* Import */}
          <div style={{ width: "100%" }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileInput}
              style={{ display: "none" }}
            />
            <button
              type="button"
              className="tap"
              onClick={() => {
                importModeRef.current = "merge";
                fileInputRef.current?.click();
              }}
              disabled={importing}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: C.paper,
                border: `1px solid ${C.paperLine}`,
                borderRadius: 14,
                padding: "14px 16px",
                marginBottom: 16,
                fontSize: 14,
                fontWeight: 600,
                color: C.ink,
                gap: 10,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Upload size={18} color={C.primary} />
                <span>Merge Data (JSON)</span>
              </div>
              {importing && <span style={{ fontSize: 11, color: C.inkMute }}>Importing...</span>}
            </button>
            <button
              type="button"
              className="tap"
              onClick={() => {
                importModeRef.current = "replace";
                fileInputRef.current?.click();
              }}
              disabled={importing}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: C.paper,
                border: `1px solid ${C.paperLine}`,
                borderRadius: 14,
                padding: "14px 16px",
                marginBottom: 16,
                fontSize: 14,
                fontWeight: 600,
                color: C.ink,
                gap: 10,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Upload size={18} color={C.primary} />
                <span>Replace Data (JSON)</span>
              </div>
            </button>
          </div>

          {/* Status */}
          {status && (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                background: status.type === "success" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                border: `1px solid ${status.type === "success" ? C.green : C.brick}`,
                color: status.type === "success" ? C.green : C.brick,
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {status.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              <span>{status.message}</span>
              <button
                onClick={dismissStatus}
                style={{
                  background: "none",
                  border: "none",
                  color: "inherit",
                  fontSize: 18,
                  padding: 0,
                  marginLeft: "auto",
                }}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Info */}
          <div
            style={{
              background: C.paper,
              border: `1px solid ${C.paperLine}`,
              borderRadius: 12,
              padding: 14,
              fontSize: 11.5,
              color: C.inkMute,
            }}
          >
            <div style={{ fontWeight: 700, color: C.ink, marginBottom: 6 }}>What gets backed up:</div>
            <div style={{ marginBottom: 4 }}>• Customers</div>
            <div style={{ marginBottom: 4 }}>• Orders</div>
            <div style={{ marginBottom: 4 }}>• Products & pricing</div>
            <div>• Recurring orders & delivery boys</div>
          </div>
        </div>
      </div>
    </div>
  );
}