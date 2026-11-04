/**
 * Types for the Universal Bulk Import Engine (Nipo Portal / SRT School)
 */

export type ImportRole = "TEACHER" | "STUDENT" | "PARENT" | "ADMIN";

export type RowValidationStatus =
  | "VALID"
  | "NEEDS_CORRECTION"
  | "DUPLICATE_IN_FILE"
  | "CONFLICT_DB"
  | "SAMPLE_ROW"
  | "SKIPPED";

export interface RawCellData {
  rawValue: unknown;
  textValue: string;
}

export interface RawRow {
  excelRowNumber: number; // 1-based exact physical Excel row number
  cells: Record<string, string>; // headerName -> coerced string value
}

export interface SheetScanInfo {
  sheetName: string;
  totalRows: number;
  dataRowCount: number;
  headerRowIndex: number; // 0-based
  headers: string[];
}

export interface ColumnMappingItem {
  excelHeader: string;
  targetField: string | null; // target field key or null if unmapped
  confidence: "EXACT" | "ALIAS" | "FUZZY" | "MANUAL" | "UNMAPPED";
  sampleValues: string[];
}

export interface SuggestionAction {
  id: string;
  label: string;
  description?: string;
  field: string;
  newValue?: any;
  actionType: "SET_FIELD" | "SWAP_FIELD" | "SKIP_ROW" | "GENERATE_PASSWORD" | "CLEAR_FIELD" | "CUSTOM";
  metadata?: Record<string, any>;
}

export interface RowValidationResult {
  rowId: string;
  excelRowNumber: number;
  status: RowValidationStatus;
  isReadyToImport: boolean;
  isSampleRow: boolean;
  fieldErrors: Record<string, string>;
  missingFields?: string[];
  invalidFields?: string[];
  warnings: Record<string, string>;
  duplicateWarnings: string[];
  conflictWarnings: string[];
  samePersonMatch?: {
    matchedRowNumber: number;
    matchedPersonName: string;
    reason: string;
    differingFields: string[];
  };
  classConflict?: {
    className: string;
    claimedByRows: number[];
  };
  suggestions: SuggestionAction[];
  data: Record<string, any>;
  originalData: Record<string, string>;
}

export interface BatchImportResult {
  totalAttempted: number;
  successfulCount: number;
  failedCount: number;
  createdUserIds: string[];
  errors: {
    excelRowNumber: number;
    identifier: string;
    error: string;
  }[];
}

export interface ImportScanSummary {
  isValid: boolean;
  sheetName: string;
  totalPhysicalRows: number;
  totalDataRows: number;
  validCount: number;
  needsCorrectionCount: number;
  duplicateCount: number;
  conflictDbCount: number;
  warningsCount: number;
  skippedCount: number;
  readyToImportCount: number;
  columnMappings: ColumnMappingItem[];
  unmappedRequiredFields: string[];
  rows: RowValidationResult[];
  availableClasses: { id: string; name: string; section: string }[];
  fileError?: string;
}

export interface ImportCommitProgress {
  totalRows: number;
  processedRows: number;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  currentBatch: number;
  totalBatches: number;
}

export interface ImportRowCommitResult {
  excelRowNumber: number;
  identifier: string;
  name: string;
  role: string;
  success: boolean;
  error?: string;
}

export interface ImportBatchCommitResult {
  success: boolean;
  totalProcessed: number;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  results: ImportRowCommitResult[];
  failedRows: Record<string, any>[];
  errors: string[];
}
