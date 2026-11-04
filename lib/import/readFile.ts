/**
 * File reader for Excel (.xlsx, .xls) and CSV (.csv) files.
 * Guarantees:
 * 1. Automatically chooses the first non-empty worksheet (ignoring empty sheets like "Sheet1").
 * 2. Preserves exact physical Excel line numbers (1-based row index) so Row 38 remains Row 38.
 * 3. Skips completely blank rows while tracking their presence so row numbers do not drift.
 * 4. Extracts raw grid data without skipping blank rows internally.
 */

import * as XLSX from "xlsx";
import Papa from "papaparse";
import { RawRow, SheetScanInfo } from "./types";
import { coerceCellToString } from "./coerce";

export interface ParsedWorkbookData {
  sheetName: string;
  allSheetNames: string[];
  headerRowIndex: number; // 0-based index in the raw grid
  physicalHeaderRowNumber: number; // 1-based Excel row number
  headers: string[];
  rows: RawRow[];
  totalPhysicalRows: number;
}

/**
 * Parses an Excel buffer or ArrayBuffer and returns structured raw rows with physical Excel line numbers.
 */
export function readExcelBuffer(buffer: Buffer | ArrayBuffer): ParsedWorkbookData {
  const wb = XLSX.read(buffer, {
    type: buffer instanceof Buffer ? "buffer" : "array",
    cellDates: true,
    cellNF: false,
    cellText: false,
  });

  const allSheetNames = wb.SheetNames;
  if (!allSheetNames || allSheetNames.length === 0) {
    throw new Error("The uploaded Excel workbook contains no worksheets.");
  }

  // 1. Find the first non-empty sheet
  let chosenSheetName = "";
  let rawGrid: unknown[][] = [];

  for (const sheetName of allSheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws["!ref"]) continue;

    // Read full raw 2D grid (header: 1 returns array of arrays, defval: "")
    const grid = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
      blankrows: true, // Crucial: do NOT skip blank rows so line numbers match Excel
    }) as unknown[][];

    // Check if sheet has at least one row with non-empty cells
    const hasData = grid.some(row =>
      Array.isArray(row) && row.some(cell => coerceCellToString(cell).trim() !== "")
    );

    if (hasData) {
      chosenSheetName = sheetName;
      rawGrid = grid;
      break;
    }
  }

  if (!chosenSheetName || rawGrid.length === 0) {
    throw new Error("No data found in any worksheet of the uploaded Excel file.");
  }

  return processRawGrid(rawGrid, chosenSheetName, allSheetNames);
}

/**
 * Parses a CSV string or buffer and returns structured raw rows with physical line numbers.
 */
export function readCsvContent(csvContent: string): ParsedWorkbookData {
  const parsed = Papa.parse(csvContent, {
    skipEmptyLines: false, // Keep empty lines to preserve physical line numbers
  });

  const rawGrid = parsed.data as unknown[][];
  if (!rawGrid || rawGrid.length === 0) {
    throw new Error("The uploaded CSV file is empty.");
  }

  return processRawGrid(rawGrid, "CSV Import", ["CSV Import"]);
}

/**
 * Internal processor for raw 2D grid:
 * - Detects the header row (first row with at least 2 non-empty text cells).
 * - Maps columns by header name.
 * - Extracts data rows preserving exact 1-based Excel row numbers.
 */
function processRawGrid(
  rawGrid: unknown[][],
  sheetName: string,
  allSheetNames: string[]
): ParsedWorkbookData {
  const totalPhysicalRows = rawGrid.length;

  // 1. Locate header row: first row with >= 2 distinct non-empty string cells
  let headerRowIndex = -1;
  let headers: string[] = [];

  for (let r = 0; r < rawGrid.length; r++) {
    const row = rawGrid[r];
    if (!Array.isArray(row)) continue;

    const nonBlankCells = row
      .map(c => coerceCellToString(c).trim())
      .filter(t => t.length > 0);

    if (nonBlankCells.length >= 2) {
      headerRowIndex = r;
      headers = row.map(c => coerceCellToString(c).trim());
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error(`Could not find a valid table header row in worksheet "${sheetName}".`);
  }

  const physicalHeaderRowNumber = headerRowIndex + 1; // 1-based

  // 2. Extract data rows
  const rows: RawRow[] = [];

  for (let r = headerRowIndex + 1; r < rawGrid.length; r++) {
    const row = rawGrid[r];
    const physicalRowNumber = r + 1; // 1-based exact physical Excel row number

    if (!Array.isArray(row)) continue;

    // Check if the entire row is blank
    const isRowBlank = row.every(c => coerceCellToString(c).trim() === "");
    if (isRowBlank) {
      // Skip blank row from output, but physicalRowNumber advances accurately!
      continue;
    }

    const cells: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const headerName = headers[c];
      if (!headerName) continue;
      const val = c < row.length ? row[c] : "";
      cells[headerName] = coerceCellToString(val);
    }

    rows.push({
      excelRowNumber: physicalRowNumber,
      cells,
    });
  }

  return {
    sheetName,
    allSheetNames,
    headerRowIndex,
    physicalHeaderRowNumber,
    headers: headers.filter(h => h.length > 0),
    rows,
    totalPhysicalRows,
  };
}
