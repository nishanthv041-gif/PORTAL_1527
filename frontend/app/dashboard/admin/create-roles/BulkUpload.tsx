"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { 
  Upload, Download, FileSpreadsheet, Loader2, AlertTriangle, 
  CheckCircle2, Edit3, Trash2, Plus, X, Search, Check, Building2, Home
} from "lucide-react";
import { bulkCreateUsers } from "@/backend/api/actions/dashboard/admin/create-roles/bulk-actions";
import Link from "next/link";

type ClassItem = {
  id: string;
  name: string;
  section: string;
};

type ScannedProfile = {
  _rowId: string;
  _status: "VALID" | "ERROR";
  _errors: string[];
  
  // Student & Parent fields
  studentFirstName?: string;
  studentLastName?: string;
  studentRollNo?: string;
  admissionNo?: string;
  studentDob?: string;
  classId?: string;
  residenceType?: "HOSTEL" | "DAYSCHOLAR";
  
  parentFirstName?: string;
  parentLastName?: string;
  parentEmail?: string;
  parentPassword?: string;
  parentPhone?: string;
  parentAddress?: string;
  
  // Teacher fields
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  phone?: string;
  joiningDate?: string;
  qualification?: string;
  
  [key: string]: unknown;
};

function isValidEmail(email?: string) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function BulkUpload({ 
  type, 
  classes = [] 
}: { 
  type: "teacher" | "student";
  classes?: ClassItem[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [scannedProfiles, setScannedProfiles] = useState<ScannedProfile[] | null>(null);
  const [editingProfile, setEditingProfile] = useState<ScannedProfile | null>(null);
  const [filter, setFilter] = useState<"ALL" | "ERRORS" | "VALID">("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [result, setResult] = useState<{ success?: boolean; count?: number; errors?: string[] } | null>(null);

  const validateRow = (row: Partial<ScannedProfile>): { status: "VALID" | "ERROR"; errors: string[] } => {
    const errors: string[] = [];

    if (type === "student") {
      if (!row.studentFirstName || !row.studentFirstName.toString().trim()) {
        errors.push("Missing Student First Name");
      }
      if (!row.studentRollNo || !row.studentRollNo.toString().trim()) {
        errors.push("Missing Roll Number");
      }
      if (!row.parentEmail || !isValidEmail(row.parentEmail)) {
        errors.push("Missing or Invalid Parent Email");
      }
      if (!row.classId && classes.length > 0) {
        errors.push("Missing Class & Section");
      }
    } else {
      if (!row.firstName || !row.firstName.toString().trim()) {
        errors.push("Missing Teacher First Name");
      }
      if (!row.email || !isValidEmail(row.email)) {
        errors.push("Missing or Invalid Email");
      }
      if (!row.password || !row.password.toString().trim()) {
        errors.push("Missing Password");
      }
    }

    return {
      status: errors.length === 0 ? "VALID" : "ERROR",
      errors
    };
  };

  const scanFile = async (selectedFile: File) => {
    setLoading(true);
    setResult(null);
    setScannedProfiles(null);

    try {
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

      if (rawRows.length === 0) {
        setResult({ errors: ["File is empty or incorrectly formatted."] });
        setLoading(false);
        return;
      }

      const parsed: ScannedProfile[] = rawRows.map((raw, idx) => {
        // Normalize keys
        const norm: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(raw)) {
          norm[k.trim().toLowerCase().replace(/[\s_]+/g, "")] = v;
        }

        const rowId = `row-${idx + 1}-${Date.now()}`;

        if (type === "student") {
          // Resolve class
          const rawClass = (norm.classid || norm.class || norm.classname || norm.section || "") as string;
          let matchedClassId = "";
          if (rawClass) {
            const classStr = rawClass.toString().trim().toLowerCase();
            const found = classes.find(c => 
              c.id.toLowerCase() === classStr ||
              `${c.name} - ${c.section}`.toLowerCase() === classStr ||
              `${c.name} - Section ${c.section}`.toLowerCase() === classStr ||
              `${c.name} ${c.section}`.toLowerCase() === classStr ||
              c.name.toLowerCase() === classStr
            );
            if (found) matchedClassId = found.id;
            else if (classes.some(c => c.id === rawClass)) matchedClassId = rawClass;
          }
          if (!matchedClassId && classes.length === 1) {
            matchedClassId = classes[0].id;
          }

          // Residence type (Hostel or Dayscholar)
          const rawResidence = (norm.residencetype || norm.hostelordayscholar || norm.hostel || norm.type || "DAYSCHOLAR") as string;
          const residenceType: "HOSTEL" | "DAYSCHOLAR" = rawResidence.toString().toUpperCase().includes("HOSTEL") 
            ? "HOSTEL" 
            : "DAYSCHOLAR";

          const studentFirstName = (norm.studentfirstname || norm.firstname || norm.studentname?.toString().split(" ")[0] || "") as string;
          const studentLastName = (norm.studentlastname || norm.lastname || norm.studentname?.toString().split(" ").slice(1).join(" ") || ".") as string;
          const studentRollNo = (norm.studentrollno || norm.rollnumber || norm.rollno || "") as string;
          const admissionNo = (norm.admissionno || norm.admissionnumber || (studentRollNo ? `ADM${studentRollNo}` : "")) as string;
          
          let studentDob = "";
          if (norm.studentdob || norm.dateofbirth || norm.dob) {
            const d = norm.studentdob || norm.dateofbirth || norm.dob;
            studentDob = d instanceof Date ? d.toISOString().split("T")[0] : String(d);
          }

          const parentEmail = (norm.parentemail || norm.email || norm.parentusername || "") as string;
          const parentPassword = (norm.parentpassword || norm.password || "Parent@123") as string;
          const parentFirstName = (norm.parentfirstname || norm.parentname?.toString().split(" ")[0] || "Parent") as string;
          const parentLastName = (norm.parentlastname || norm.parentname?.toString().split(" ").slice(1).join(" ") || ".") as string;
          const parentPhone = (norm.parentphone || norm.phone || norm.mobile || "") as string;
          const parentAddress = (norm.parentaddress || norm.address || "") as string;

          const rowData: Partial<ScannedProfile> = {
            _rowId: rowId,
            studentFirstName,
            studentLastName,
            studentRollNo: studentRollNo ? String(studentRollNo) : "",
            admissionNo: admissionNo ? String(admissionNo) : "",
            studentDob,
            classId: matchedClassId,
            residenceType,
            parentFirstName,
            parentLastName,
            parentEmail: parentEmail ? String(parentEmail).trim() : "",
            parentPassword: String(parentPassword),
            parentPhone: parentPhone ? String(parentPhone) : "",
            parentAddress: String(parentAddress),
          };

          const validation = validateRow(rowData);
          return {
            ...rowData,
            _status: validation.status,
            _errors: validation.errors
          } as ScannedProfile;
        } else {
          // Teacher
          const email = (norm.email || norm.officialemail || norm.username || "") as string;
          const password = (norm.password || norm.temppassword || "Teacher@123") as string;
          const firstName = (norm.firstname || norm.first_name || norm.name?.toString().split(" ")[0] || "") as string;
          const lastName = (norm.lastname || norm.last_name || norm.name?.toString().split(" ").slice(1).join(" ") || ".") as string;
          const phone = (norm.phone || norm.phonenumber || norm.mobile || "") as string;
          const qualification = (norm.qualification || norm.degree || norm.department || "") as string;
          
          let joiningDate = "";
          if (norm.joiningdate || norm.joindate) {
            const d = norm.joiningdate || norm.joindate;
            joiningDate = d instanceof Date ? d.toISOString().split("T")[0] : String(d);
          }

          const rowData: Partial<ScannedProfile> = {
            _rowId: rowId,
            firstName,
            lastName,
            email: email ? String(email).trim() : "",
            password: String(password),
            phone: phone ? String(phone) : "",
            qualification: String(qualification),
            joiningDate
          };

          const validation = validateRow(rowData);
          return {
            ...rowData,
            _status: validation.status,
            _errors: validation.errors
          } as ScannedProfile;
        }
      });

      setScannedProfiles(parsed);
    } catch (err) {
      setResult({ errors: [err instanceof Error ? err.message : "Failed to scan file"] });
    }
    setLoading(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      scanFile(selected);
    }
  };

  const handleSaveEditedProfile = (updatedProfile: ScannedProfile) => {
    if (!scannedProfiles) return;
    const validation = validateRow(updatedProfile);
    const finalizedProfile: ScannedProfile = {
      ...updatedProfile,
      _status: validation.status,
      _errors: validation.errors
    };

    setScannedProfiles(prev => 
      prev ? prev.map(p => p._rowId === finalizedProfile._rowId ? finalizedProfile : p) : []
    );
    setEditingProfile(null);
  };

  const handleDeleteProfile = (rowId: string) => {
    if (!confirm("Are you sure you want to remove this profile from import?")) return;
    setScannedProfiles(prev => prev ? prev.filter(p => p._rowId !== rowId) : []);
  };

  const handleAddNewBlankProfile = () => {
    const newId = `row-manual-${Date.now()}`;
    const newProfile: ScannedProfile = type === "student" ? {
      _rowId: newId,
      _status: "ERROR",
      _errors: ["Missing Student First Name", "Missing Roll Number", "Missing or Invalid Parent Email"],
      studentFirstName: "",
      studentLastName: "",
      studentRollNo: "",
      admissionNo: "",
      classId: classes[0]?.id || "",
      residenceType: "DAYSCHOLAR",
      parentFirstName: "",
      parentLastName: "",
      parentEmail: "",
      parentPassword: "Parent@123",
      parentPhone: "",
      parentAddress: ""
    } : {
      _rowId: newId,
      _status: "ERROR",
      _errors: ["Missing Teacher First Name", "Missing or Invalid Email"],
      firstName: "",
      lastName: "",
      email: "",
      password: "Teacher@123",
      phone: "",
      qualification: ""
    };

    setScannedProfiles(prev => prev ? [newProfile, ...prev] : [newProfile]);
    setEditingProfile(newProfile);
  };

  const handleUploadValidProfiles = async (onlyValid: boolean = false) => {
    if (!scannedProfiles || scannedProfiles.length === 0) return;

    const targets = onlyValid 
      ? scannedProfiles.filter(p => p._status === "VALID")
      : scannedProfiles;

    if (targets.length === 0) {
      alert("No valid profiles to import. Please fix the highlighted mistakes first.");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const payload = targets.map(p => {
        const { _rowId, _status, _errors, ...data } = p;
        return data;
      });

      const res = await bulkCreateUsers(type, payload as Record<string, unknown>[]);
      if (res.error) {
        setResult({ errors: [res.error] });
      } else {
        setResult({ success: true, count: res.count, errors: res.errors });
        // If some succeeded, clear imported ones from list
        if (res.count && res.count > 0 && scannedProfiles) {
          if (onlyValid) {
            setScannedProfiles(prev => prev ? prev.filter(p => p._status !== "VALID") : []);
          } else {
            setScannedProfiles([]);
          }
        }
      }
    } catch (err) {
      setResult({ errors: [err instanceof Error ? err.message : "Failed to import records"] });
    }
    setLoading(false);
  };

  const downloadTemplate = () => {
    const data = type === "teacher" 
      ? [{ 
          firstName: "John", 
          lastName: "Doe", 
          email: "john.teacher@example.com", 
          password: "password123", 
          phone: "9876543210", 
          joiningDate: "2026-06-01", 
          qualification: "M.Sc., B.Ed." 
        }]
      : [{ 
          studentFirstName: "Jimmy", 
          studentLastName: "Doe", 
          studentRollNo: "101", 
          admissionNo: "ADM101", 
          studentDob: "2010-05-15", 
          class: classes[0] ? `${classes[0].name} - ${classes[0].section}` : "Grade 10 - A", 
          residenceType: "Dayscholar (or Hostel)", 
          parentFirstName: "Jane", 
          parentLastName: "Doe", 
          parentEmail: "jane.parent@example.com", 
          parentPassword: "password123", 
          parentPhone: "9876543210", 
          parentAddress: "123 Main Street" 
        }];
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, `${type}_upload_template.xlsx`);
  };

  const errorCount = scannedProfiles ? scannedProfiles.filter(p => p._status === "ERROR").length : 0;
  const validCount = scannedProfiles ? scannedProfiles.filter(p => p._status === "VALID").length : 0;
  const totalCount = scannedProfiles ? scannedProfiles.length : 0;

  const filteredProfiles = scannedProfiles ? scannedProfiles.filter(p => {
    if (filter === "ERRORS" && p._status !== "ERROR") return false;
    if (filter === "VALID" && p._status !== "VALID") return false;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (type === "student") {
        const name = `${p.studentFirstName} ${p.studentLastName}`.toLowerCase();
        const roll = (p.studentRollNo || "").toLowerCase();
        const email = (p.parentEmail || "").toLowerCase();
        return name.includes(q) || roll.includes(q) || email.includes(q);
      } else {
        const name = `${p.firstName} ${p.lastName}`.toLowerCase();
        const email = (p.email || "").toLowerCase();
        return name.includes(q) || email.includes(q);
      }
    }
    return true;
  }) : [];

  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '2rem', marginTop: '2.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h3 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--foreground)' }}>
            <FileSpreadsheet className="text-primary" size={24} /> 
            Smart Bulk Upload: {type === 'teacher' ? 'Teachers' : 'Parents & Students'}
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.35rem', fontSize: '0.9rem', marginBottom: 0 }}>
            Upload an Excel (.xlsx/.xls) or CSV file. The portal scans details, catches missing/mistake fields, and enables instant inline editing before saving.
          </p>
        </div>

        <button 
          onClick={downloadTemplate}
          style={{ 
            padding: '0.6rem 1.1rem', 
            background: 'transparent', 
            color: 'var(--primary)', 
            border: '1px solid var(--primary)',
            borderRadius: '8px', 
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'background 0.2s'
          }}
        >
          <Download size={16} /> Download Template
        </button>
      </div>

      {/* File Select & Upload Zone */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '1rem', 
        flexWrap: 'wrap', 
        backgroundColor: 'rgba(0,0,0,0.02)', 
        border: '2px dashed var(--border-color)', 
        padding: '1.25rem', 
        borderRadius: '10px' 
      }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '260px' }}>
          <input 
            type="file" 
            accept=".xlsx, .xls, .csv" 
            onChange={handleFileChange}
            id={`file-upload-${type}`}
            style={{ display: 'none' }}
          />
          <label 
            htmlFor={`file-upload-${type}`}
            style={{
              padding: '0.65rem 1.25rem',
              backgroundColor: 'var(--background)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '0.875rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--foreground)'
            }}
          >
            <Upload size={16} />
            {file ? file.name : "Select Excel/CSV File"}
          </label>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {file ? `(${Math.round(file.size / 1024)} KB) - Auto-scanned` : "Supports .xlsx, .xls, .csv"}
          </span>
        </div>

        {file && (
          <button 
            onClick={() => scanFile(file)}
            disabled={loading}
            style={{
              padding: '0.65rem 1.2rem',
              backgroundColor: 'var(--background)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : null}
            Re-scan File
          </button>
        )}
      </div>

      {/* Global Result notification */}
      {result && (
        <div style={{ 
          marginTop: '1.5rem', 
          padding: '1.25rem', 
          borderRadius: '10px', 
          background: result.success ? (result.errors?.length ? 'var(--warning-bg)' : 'var(--success-bg)') : 'var(--danger-bg)',
          border: `1px solid ${result.success ? 'var(--success)' : 'var(--danger)'}`
        }}>
          {result.success && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--success)', fontWeight: 700, fontSize: '1rem' }}>
                <CheckCircle2 size={22} />
                Successfully imported and created {result.count} {type === 'student' ? 'students & parents' : 'teachers'}!
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <Link 
                  href={type === 'student' ? '/dashboard/admin/students' : '/dashboard/admin/teachers'}
                  style={{
                    padding: '0.45rem 1rem',
                    backgroundColor: 'var(--success)',
                    color: '#fff',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    fontSize: '0.875rem',
                    fontWeight: 600
                  }}
                >
                  View in {type === 'student' ? 'Students List' : 'Teachers List'}
                </Link>
              </div>
            </div>
          )}

          {result.errors && result.errors.length > 0 && (
            <div style={{ marginTop: result.success ? '1rem' : 0 }}>
              <p style={{ color: 'var(--danger)', fontWeight: 600, margin: '0 0 0.5rem 0' }}>Issues reported by server:</p>
              <ul style={{ color: 'var(--danger)', fontSize: '0.875rem', paddingLeft: '1.5rem', margin: 0 }}>
                {result.errors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Scanned Profiles Interactive Area */}
      {scannedProfiles && (
        <div style={{ marginTop: '2rem' }}>
          {/* Summary Dashboard Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ padding: '1rem', borderRadius: '10px', background: 'var(--card)', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Total Scanned</span>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: 'var(--foreground)' }}>{totalCount}</div>
            </div>

            <div style={{ padding: '1rem', borderRadius: '10px', background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--success)', textTransform: 'uppercase', fontWeight: 600 }}>Ready to Import</span>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: 'var(--success)' }}>{validCount}</div>
            </div>

            <div style={{ padding: '1rem', borderRadius: '10px', background: errorCount > 0 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(0,0,0,0.02)', border: `1px solid ${errorCount > 0 ? 'rgba(239, 68, 68, 0.3)' : 'var(--border-color)'}` }}>
              <span style={{ fontSize: '0.8rem', color: errorCount > 0 ? 'var(--danger)' : 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Mistakes to Fix</span>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem', color: errorCount > 0 ? 'var(--danger)' : 'var(--foreground)' }}>{errorCount}</div>
            </div>
          </div>

          {/* Action Bar & Filter */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button 
                onClick={() => setFilter("ALL")}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: filter === "ALL" ? 'var(--primary)' : 'transparent',
                  color: filter === "ALL" ? 'var(--primary-fg)' : 'inherit',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                All ({totalCount})
              </button>

              <button 
                onClick={() => setFilter("ERRORS")}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: '6px',
                  border: `1px solid ${filter === "ERRORS" ? 'var(--danger)' : 'var(--border-color)'}`,
                  backgroundColor: filter === "ERRORS" ? 'var(--danger)' : 'transparent',
                  color: filter === "ERRORS" ? '#fff' : 'var(--danger)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                <AlertTriangle size={15} /> Needs Fixing ({errorCount})
              </button>

              <button 
                onClick={() => setFilter("VALID")}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: '6px',
                  border: `1px solid ${filter === "VALID" ? 'var(--success)' : 'var(--border-color)'}`,
                  backgroundColor: filter === "VALID" ? 'var(--success)' : 'transparent',
                  color: filter === "VALID" ? '#fff' : 'var(--success)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                <CheckCircle2 size={15} /> Ready ({validCount})
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', width: '220px' }}>
                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                <input 
                  type="text" 
                  placeholder="Filter scanned list..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ width: '100%', padding: '0.45rem 0.75rem 0.45rem 2rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'transparent', fontSize: '0.85rem' }}
                />
              </div>

              <button 
                onClick={handleAddNewBlankProfile}
                style={{
                  padding: '0.5rem 0.9rem',
                  backgroundColor: 'transparent',
                  border: '1px dashed var(--primary)',
                  color: 'var(--primary)',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  cursor: 'pointer'
                }}
              >
                <Plus size={16} /> Add Profile
              </button>

              {validCount > 0 && (
                <button 
                  onClick={() => handleUploadValidProfiles(errorCount > 0)}
                  disabled={loading}
                  style={{
                    padding: '0.55rem 1.4rem',
                    backgroundColor: 'var(--primary)',
                    color: 'var(--primary-fg)',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)'
                  }}
                >
                  {loading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                  {errorCount === 0 
                    ? `Save & Import All ${validCount} Records` 
                    : `Import ${validCount} Valid Records (Skip Mistakes)`}
                </button>
              )}
            </div>
          </div>

          {/* Scanned Table */}
          <div style={{ overflowX: 'auto', width: '100%', maxWidth: '100%', minWidth: 0, WebkitOverflowScrolling: 'touch', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem', minWidth: '750px' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Status</th>
                  {type === 'student' ? (
                    <>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Student Name</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Roll No.</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Class</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Hostel / Dayscholar</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Parent Email</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Parent Phone</th>
                    </>
                  ) : (
                    <>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Teacher Name</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Official Email</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Phone</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Qualification</th>
                    </>
                  )}
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProfiles.map((p, idx) => {
                  const hasError = p._status === "ERROR";
                  const classObj = classes.find(c => c.id === p.classId);

                  return (
                    <tr 
                      key={p._rowId || idx}
                      style={{ 
                        borderBottom: '1px solid var(--border-color)',
                        backgroundColor: hasError ? 'rgba(239, 68, 68, 0.04)' : 'transparent',
                        transition: 'background 0.15s'
                      }}
                    >
                      {/* Status & Mistake summary */}
                      <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                        {hasError ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <span style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '0.35rem', 
                              color: 'var(--danger)', 
                              fontSize: '0.75rem', 
                              fontWeight: 700,
                              backgroundColor: 'rgba(239, 68, 68, 0.12)',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '999px',
                              width: 'fit-content'
                            }}>
                              <AlertTriangle size={13} /> Missing Details
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--danger)', opacity: 0.9 }}>
                              {p._errors.join(", ")}
                            </span>
                          </div>
                        ) : (
                          <span style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '0.35rem', 
                            color: 'var(--success)', 
                            fontSize: '0.75rem', 
                            fontWeight: 700,
                            backgroundColor: 'rgba(34, 197, 94, 0.12)',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '999px'
                          }}>
                            <CheckCircle2 size={13} /> Ready
                          </span>
                        )}
                      </td>

                      {/* Content cells */}
                      {type === 'student' ? (
                        <>
                          <td style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>
                            {p.studentFirstName ? `${p.studentFirstName} ${p.studentLastName || ""}` : (
                              <span style={{ color: 'var(--danger)', fontStyle: 'italic' }}>Required *</span>
                            )}
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            {p.studentRollNo || <span style={{ color: 'var(--danger)', fontStyle: 'italic' }}>Missing *</span>}
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            {classObj ? `${classObj.name} - ${classObj.section}` : (
                              <span style={{ color: 'var(--danger)', fontStyle: 'italic' }}>Not Selected *</span>
                            )}
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <span style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '0.35rem',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              backgroundColor: p.residenceType === 'HOSTEL' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                              color: p.residenceType === 'HOSTEL' ? 'var(--warning)' : 'var(--primary)'
                            }}>
                              {p.residenceType === 'HOSTEL' ? <Building2 size={12} /> : <Home size={12} />}
                              {p.residenceType === 'HOSTEL' ? 'Hostel' : 'Dayscholar'}
                            </span>
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            {p.parentEmail ? p.parentEmail : <span style={{ color: 'var(--danger)', fontStyle: 'italic' }}>Missing *</span>}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', opacity: 0.8 }}>
                            {p.parentPhone || "—"}
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>
                            {p.firstName ? `${p.firstName} ${p.lastName || ""}` : (
                              <span style={{ color: 'var(--danger)', fontStyle: 'italic' }}>Required *</span>
                            )}
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            {p.email || <span style={{ color: 'var(--danger)', fontStyle: 'italic' }}>Missing *</span>}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', opacity: 0.8 }}>
                            {p.phone || "—"}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', opacity: 0.8 }}>
                            {p.qualification || "—"}
                          </td>
                        </>
                      )}

                      {/* Actions */}
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                          <button 
                            onClick={() => setEditingProfile({ ...p })}
                            title="Edit and fix mistake"
                            style={{
                              padding: '0.35rem 0.75rem',
                              backgroundColor: hasError ? 'var(--primary)' : 'transparent',
                              color: hasError ? 'var(--primary-fg)' : 'var(--primary)',
                              border: '1px solid var(--primary)',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem'
                            }}
                          >
                            <Edit3 size={13} /> {hasError ? "Fix Mistake" : "Edit"}
                          </button>

                          <button 
                            onClick={() => handleDeleteProfile(p._rowId)}
                            title="Remove row"
                            style={{
                              padding: '0.35rem',
                              backgroundColor: 'transparent',
                              color: 'var(--danger)',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              opacity: 0.7
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredProfiles.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)' }}>
                      No records matching the filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mistake Edit Modal / Drawer */}
      {editingProfile && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(3px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '14px',
            width: '100%',
            maxWidth: '650px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '1.75rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <div>
                <h4 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>
                  Fix Profile Details & Mistakes
                </h4>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Update missing or incorrect fields. All changes re-validate automatically.
                </p>
              </div>
              <button 
                onClick={() => setEditingProfile(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* If errors, display alert */}
            {editingProfile._errors.length > 0 && (
              <div style={{ 
                background: 'rgba(239, 68, 68, 0.08)', 
                border: '1px solid rgba(239, 68, 68, 0.3)', 
                borderRadius: '8px', 
                padding: '0.75rem 1rem', 
                marginBottom: '1.25rem',
                color: 'var(--danger)',
                fontSize: '0.85rem'
              }}>
                <strong>Detected Issues to Correct:</strong>
                <ul style={{ margin: '0.35rem 0 0 0', paddingLeft: '1.25rem' }}>
                  {editingProfile._errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}

            {/* Edit form */}
            <form onSubmit={(e) => {
              e.preventDefault();
              handleSaveEditedProfile(editingProfile);
            }}>
              {type === 'student' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h5 style={{ margin: '0.5rem 0 0.25rem 0', fontSize: '0.95rem', fontWeight: 600, color: 'var(--primary)' }}>
                    Student Information
                  </h5>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Student First Name *
                      </label>
                      <input 
                        required
                        type="text"
                        value={editingProfile.studentFirstName || ""}
                        onChange={(e) => setEditingProfile({ ...editingProfile, studentFirstName: e.target.value })}
                        style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: `1px solid ${!editingProfile.studentFirstName ? 'var(--danger)' : 'var(--border-color)'}`, backgroundColor: 'transparent' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Student Last Name
                      </label>
                      <input 
                        type="text"
                        value={editingProfile.studentLastName || ""}
                        onChange={(e) => setEditingProfile({ ...editingProfile, studentLastName: e.target.value })}
                        style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'transparent' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Roll Number *
                      </label>
                      <input 
                        required
                        type="text"
                        value={editingProfile.studentRollNo || ""}
                        onChange={(e) => setEditingProfile({ ...editingProfile, studentRollNo: e.target.value })}
                        style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: `1px solid ${!editingProfile.studentRollNo ? 'var(--danger)' : 'var(--border-color)'}`, backgroundColor: 'transparent' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Admission Number
                      </label>
                      <input 
                        type="text"
                        value={editingProfile.admissionNo || ""}
                        onChange={(e) => setEditingProfile({ ...editingProfile, admissionNo: e.target.value })}
                        placeholder={`ADM${editingProfile.studentRollNo || ''}`}
                        style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'transparent' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Class & Section *
                      </label>
                      <select 
                        required
                        value={editingProfile.classId || ""}
                        onChange={(e) => setEditingProfile({ ...editingProfile, classId: e.target.value })}
                        style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: `1px solid ${!editingProfile.classId ? 'var(--danger)' : 'var(--border-color)'}`, backgroundColor: 'transparent' }}
                      >
                        <option value="">Select a Class...</option>
                        {classes.map(c => (
                          <option key={c.id} value={c.id}>{c.name} - Section {c.section}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Hostel or Dayscholar *
                      </label>
                      <select 
                        required
                        value={editingProfile.residenceType || "DAYSCHOLAR"}
                        onChange={(e) => setEditingProfile({ ...editingProfile, residenceType: e.target.value as "HOSTEL" | "DAYSCHOLAR" })}
                        style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'transparent' }}
                      >
                        <option value="DAYSCHOLAR">Dayscholar</option>
                        <option value="HOSTEL">Hostel</option>
                      </select>
                    </div>
                  </div>

                  <h5 style={{ margin: '1rem 0 0.25rem 0', fontSize: '0.95rem', fontWeight: 600, color: 'var(--primary)' }}>
                    Parent Information & Login
                  </h5>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Parent Email (Login ID) *
                      </label>
                      <input 
                        required
                        type="email"
                        value={editingProfile.parentEmail || ""}
                        onChange={(e) => setEditingProfile({ ...editingProfile, parentEmail: e.target.value })}
                        style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: `1px solid ${!isValidEmail(editingProfile.parentEmail) ? 'var(--danger)' : 'var(--border-color)'}`, backgroundColor: 'transparent' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Temporary Password *
                      </label>
                      <input 
                        required
                        type="text"
                        value={editingProfile.parentPassword || "Parent@123"}
                        onChange={(e) => setEditingProfile({ ...editingProfile, parentPassword: e.target.value })}
                        style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'transparent' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Parent Name
                      </label>
                      <input 
                        type="text"
                        value={editingProfile.parentFirstName || ""}
                        onChange={(e) => setEditingProfile({ ...editingProfile, parentFirstName: e.target.value })}
                        style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'transparent' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Parent Phone
                      </label>
                      <input 
                        type="text"
                        value={editingProfile.parentPhone || ""}
                        onChange={(e) => setEditingProfile({ ...editingProfile, parentPhone: e.target.value })}
                        style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'transparent' }}
                      />
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Address
                      </label>
                      <input 
                        type="text"
                        value={editingProfile.parentAddress || ""}
                        onChange={(e) => setEditingProfile({ ...editingProfile, parentAddress: e.target.value })}
                        style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'transparent' }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      First Name *
                    </label>
                    <input 
                      required
                      type="text"
                      value={editingProfile.firstName || ""}
                      onChange={(e) => setEditingProfile({ ...editingProfile, firstName: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: `1px solid ${!editingProfile.firstName ? 'var(--danger)' : 'var(--border-color)'}`, backgroundColor: 'transparent' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Last Name
                    </label>
                    <input 
                      type="text"
                      value={editingProfile.lastName || ""}
                      onChange={(e) => setEditingProfile({ ...editingProfile, lastName: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'transparent' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Official Email *
                    </label>
                    <input 
                      required
                      type="email"
                      value={editingProfile.email || ""}
                      onChange={(e) => setEditingProfile({ ...editingProfile, email: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: `1px solid ${!isValidEmail(editingProfile.email) ? 'var(--danger)' : 'var(--border-color)'}`, backgroundColor: 'transparent' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Password *
                    </label>
                    <input 
                      required
                      type="text"
                      value={editingProfile.password || "Teacher@123"}
                      onChange={(e) => setEditingProfile({ ...editingProfile, password: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'transparent' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Phone
                    </label>
                    <input 
                      type="text"
                      value={editingProfile.phone || ""}
                      onChange={(e) => setEditingProfile({ ...editingProfile, phone: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'transparent' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Qualification
                    </label>
                    <input 
                      type="text"
                      value={editingProfile.qualification || ""}
                      onChange={(e) => setEditingProfile({ ...editingProfile, qualification: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'transparent' }}
                    />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <button 
                  type="button"
                  onClick={() => setEditingProfile(null)}
                  style={{
                    padding: '0.6rem 1.25rem',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>

                <button 
                  type="submit"
                  style={{
                    padding: '0.6rem 1.5rem',
                    backgroundColor: 'var(--primary)',
                    color: 'var(--primary-fg)',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  <Check size={16} /> Save & Re-validate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
