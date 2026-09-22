"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { Upload, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { bulkCreateUsers } from "@/backend/api/actions/dashboard/admin/create-roles/bulk-actions";

export default function BulkUpload({ type }: { type: "teacher" | "student" }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success?: boolean, count?: number, errors?: string[] } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    setResult(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet);

      if (jsonData.length === 0) {
        setResult({ errors: ["File is empty or incorrectly formatted."] });
        setLoading(false);
        return;
      }

      const res = await bulkCreateUsers(type, jsonData as Record<string, unknown>[]);
      if (res.error) {
        setResult({ errors: [res.error] });
      } else {
        setResult({ success: true, count: res.count, errors: res.errors });
      }
    } catch (err) {
      setResult({ errors: [err instanceof Error ? err.message : "Failed to process file"] });
    }
    setLoading(false);
  };

  const downloadTemplate = () => {
    const data = type === "teacher" 
      ? [{ username: "t123", password: "password", firstName: "John", lastName: "Doe", phone: "1234567890", email: "john@example.com", joiningDate: "2026-09-01", department: "Science" }]
      : [{ parentUsername: "p123", parentPassword: "password", parentFirstName: "Jane", parentLastName: "Doe", parentEmail: "jane@example.com", parentPhone: "0987654321", parentAddress: "123 Main St", studentFirstName: "Jimmy", studentLastName: "Doe", studentRollNo: "101", studentDob: "2010-01-01", classId: "cl_abc123" }];
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, `${type}_upload_template.xlsx`);
  };

  return (
    <div style={{ background: 'var(--card-bg)', border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '2rem', marginTop: '2rem' }}>
      <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <FileSpreadsheet /> Bulk Upload {type === 'teacher' ? 'Teachers' : 'Parents & Students'}
      </h3>
      
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
        Upload an Excel (.xlsx) file to create multiple {type === 'teacher' ? 'teachers' : 'parents and students'} at once.
      </p>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input 
          type="file" 
          accept=".xlsx, .xls, .csv" 
          onChange={handleFileChange}
          style={{ padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--background)' }}
        />
        
        <button 
          onClick={handleUpload}
          disabled={!file || loading}
          style={{ 
            padding: '0.5rem 1.5rem', 
            background: "var(--primary)", color: "var(--primary-fg)", 
            borderRadius: '6px', 
            border: 'none', 
            fontWeight: 500,
            cursor: !file || loading ? 'not-allowed' : 'pointer',
            opacity: !file || loading ? 0.7 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
          Upload
        </button>

        <button 
          onClick={downloadTemplate}
          style={{ 
            padding: '0.5rem 1rem', 
            background: 'transparent', 
            color: 'var(--primary)', 
            border: '1px solid var(--primary)',
            borderRadius: '6px', 
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <Download size={18} /> Download Template
        </button>
      </div>

      {result && (
        <div style={{ marginTop: '1.5rem', padding: '1rem', borderRadius: '8px', background: result.success ? (result.errors?.length ? 'var(--warning-bg)' : 'var(--success-bg)') : 'var(--danger-bg)' }}>
          {result.success && <p style={{ color: 'var(--success)', fontWeight: 600, margin: 0 }}>Successfully created {result.count} records.</p>}
          {result.errors && result.errors.length > 0 && (
            <div style={{ marginTop: '0.5rem' }}>
              <p style={{ color: 'var(--danger)', fontWeight: 600, margin: 0, marginBottom: '0.5rem' }}>Errors encountered:</p>
              <ul style={{ color: 'var(--danger)', fontSize: '0.875rem', paddingLeft: '1.5rem', margin: 0 }}>
                {result.errors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
