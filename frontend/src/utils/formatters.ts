/**
 * Centralized formatting utilities for the Schul-Stat application.
 */

import type { Snapshot } from "../types";

/**
 * Shortens a string to a maximum length and appends an ellipsis.
 */
export function shortenLabel(value: string | number | null | undefined, maxLength: number = 20): string {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

/**
 * Extracts the raw snapshot date string from a snapshot option object or string.
 */
export function getSnapshotValue(option: Snapshot | string | null | undefined): string {
  if (option && typeof option === "object") {
    const snapId = String(option.snapId || "").trim();
    return snapId || String(option.snapshotDate || "");
  }
  return String(option || "");
}

/**
 * Generates a user-friendly label for a snapshot option.
 */
export function getSnapshotLabel(option: Snapshot | string | null | undefined): string {
  const snapshotDate = getSnapshotValue(option);
  if (!snapshotDate) return "";
  if (!option || typeof option !== "object") return snapshotDate;

  const schoolYear = Number(option.schoolYear || 0);
  const termNo = Number(option.termNo || 0);
  const info = String(option.info || "").trim();

  const termLabel =
    schoolYear > 0 && termNo > 0
      ? `${schoolYear}.${String(termNo).padStart(2, "0")} - `
      : "";

  const baseLabel = `${termLabel}${snapshotDate}`;
  return info ? `${baseLabel} - ${info}` : baseLabel;
}

export function getSnapshotName(option: Snapshot | string | null | undefined): string {
  if (!option || typeof option !== "object") return "";
  const info = String(option.info || "").trim();
  if (info) return info;
  return String(option.source || "").trim();
}

/**
 * Formats a school series label for charts.
 */
export function formatSchoolSeriesLabel(snr: string | number | null | undefined, schoolName: string | null | undefined): string {
  const snrStr = String(snr || "").trim() || "-";
  const nameStr = String(schoolName || "").trim() || snrStr;
  return `${snrStr} | ${shortenLabel(nameStr, 20)}`;
}
