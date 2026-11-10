"use client";

import { useState, useTransition } from "react";
import {
  Calendar,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Upload,
  Download,
  Users,
  GraduationCap,
  Briefcase,
  UserCheck,
  Heart,
  Truck,
  Save,
  Check,
  X,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import {
  MissingDobPerson,
  updateSinglePersonDobAction,
  previewBulkDobUploadAction,
  commitBulkDobUpdatesAction,
  BulkDobPreviewItem,
} from "@/backend/api/actions/dashboard/admin/birthdays/actions";

interface MissingDobClientProps {
  initialData: {
    totalPeople: number;
    totalMissing: number;
    completedCount: number;
    percentage: number;
    people: MissingDobPerson[];
  };
  classes: { id: string; name: string; section: string }[];
}

export default function MissingDobClient({ initialData, classes }: MissingDobClientProps) {
  const [data, setData] = useState(initialData);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [classFilter, setClassFilter] = useState<string>("ALL");

  // Inline edit state
  const [editingDates, setEditingDates] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [successIds, setSuccessIds] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  // Bulk Upload Modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewItems, setPreviewItems] = useState<BulkDobPreviewItem[] | null>(null);
  const [uploadStats, setUploadStats] = useState<{ total: number; matched: number; unmatched: number; invalid: number } | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitMessage, setCommitMessage] = useState<string | null>(null);

  const [, startTransition] = useTransition();

  // Filtered people
  const filteredPeople = data.people.filter((person) => {
    // Role filter
    if (roleFilter !== "ALL" && person.role !== roleFilter) {
      return false;
    }
    // Class filter (only applies to students)
    if (classFilter !== "ALL") {
      if (person.role !== "STUDENT" || person.classId !== classFilter) {
        return false;
      }
    }
    // Search query
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = person.name.toLowerCase().includes(q);
      const matchId = person.identifier.toLowerCase().includes(q);
      const matchClass = person.className?.toLowerCase().includes(q);
      return matchName || matchId || matchClass;
    }
    return true;
  });

  // Handle single DOB save
  const handleSaveDob = async (person: MissingDobPerson) => {
    const dobValue = editingDates[person.id];
    if (!dobValue) {
      setRowErrors((prev) => ({ ...prev, [person.id]: "Please select a date." }));
      return;
    }

    setSavingId(person.id);
    setRowErrors((prev) => ({ ...prev, [person.id]: "" }));

    const res = await updateSinglePersonDobAction({
      personType: person.role,
      personId: person.id,
      dateOfBirth: dobValue,
    });

    setSavingId(null);

    if (res.error) {
      setRowErrors((prev) => ({ ...prev, [person.id]: res.error || "Failed to save." }));
    } else {
      // Mark as success and remove from missing list
      setSuccessIds((prev) => new Set(prev).add(person.id));
      setTimeout(() => {
        setData((prev) => {
          const nextPeople = prev.people.filter((p) => p.id !== person.id);
          const nextCompleted = prev.completedCount + 1;
          const nextMissing = Math.max(0, prev.totalMissing - 1);
          return {
            ...prev,
            people: nextPeople,
            completedCount: nextCompleted,
            totalMissing: nextMissing,
            percentage: prev.totalPeople > 0 ? Math.round((nextCompleted / prev.totalPeople) * 100) : 100,
          };
        });
        setSuccessIds((prev) => {
          const s = new Set(prev);
          s.delete(person.id);
          return s;
        });
      }, 1200);
    }
  };

  // Handle Bulk Upload Preview
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setIsUploading(true);
    setCommitMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await previewBulkDobUploadAction(formData);
      setIsUploading(false);

      if (!res.success) {
        setCommitMessage(res.error || "Failed to parse file.");
        return;
      }

      setPreviewItems(res.items || []);
      setUploadStats({
        total: res.totalRows || 0,
        matched: res.matchedCount || 0,
        unmatched: res.unmatchedCount || 0,
        invalid: res.invalidDobCount || 0,
      });
    } catch {
      setIsUploading(false);
      setCommitMessage("An error occurred while uploading.");
    }
  };

  // Commit Bulk Upload
  const handleCommitBulk = async () => {
    if (!previewItems) return;
    setIsCommitting(true);

    const validItems = previewItems
      .filter((i) => i.status === "MATCHED")
      .map((i) => ({
        personId: i.personId,
        role: i.role,
        newDob: i.newDob,
      }));

    const res = await commitBulkDobUpdatesAction(validItems);
    setIsCommitting(false);

    if (res.success) {
      setCommitMessage(`Successfully updated ${res.updatedCount} Date of Birth records!`);
      // Update local state by removing matched IDs
      const updatedIds = new Set(validItems.map((v) => v.personId));
      setData((prev) => {
        const nextPeople = prev.people.filter((p) => !updatedIds.has(p.id));
        const added = prev.people.length - nextPeople.length;
        const nextCompleted = prev.completedCount + added;
        const nextMissing = Math.max(0, prev.totalMissing - added);
        return {
          ...prev,
          people: nextPeople,
          completedCount: nextCompleted,
          totalMissing: nextMissing,
          percentage: prev.totalPeople > 0 ? Math.round((nextCompleted / prev.totalPeople) * 100) : 100,
        };
      });

      setTimeout(() => {
        setShowUploadModal(false);
        setPreviewItems(null);
        setSelectedFile(null);
        setCommitMessage(null);
      }, 2000);
    } else {
      setCommitMessage(res.error || "Failed to commit changes.");
    }
  };

  // Download Sample CSV template for DOB
  const handleDownloadDobTemplate = () => {
    const csvContent = "identifier,dateOfBirth\nADM101,2012-05-15\n102,15/06/2013\nteacher@srtschool.com,1988-11-20\nparent@srtschool.com,1985-04-12\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "dob_update_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const roleBadge = (role: string) => {
    switch (role) {
      case "STUDENT":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">Student</span>;
      case "TEACHER":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">Teacher</span>;
      case "STAFF":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Staff</span>;
      case "ADMIN":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">Admin</span>;
      case "PARENT":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">Parent</span>;
      case "DRIVER":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">Bus Driver</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">{role}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <Calendar className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            Missing Date of Birth Records
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Ensure every student, teacher, staff, admin, parent, and bus driver has their Date of Birth recorded for accurate automated birthday wishes.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleDownloadDobTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm"
          >
            <Download className="w-4 h-4" />
            Template
          </button>
          <button
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors"
          >
            <Upload className="w-4 h-4" />
            Update DOB from Excel
          </button>
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total People</span>
            <Users className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-2">{data.totalPeople}</div>
          <p className="text-xs text-gray-400 mt-1">Students, staff, parents & fleet</p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">DOB Completed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">{data.completedCount}</div>
          <p className="text-xs text-emerald-600/70 mt-1">{data.percentage}% recorded</p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">Missing DOB</span>
            <AlertCircle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-2">{data.totalMissing}</div>
          <p className="text-xs text-amber-600/70 mt-1">Require immediate entry</p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Completion Progress</span>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{data.percentage}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mt-3 overflow-hidden">
            <div
              className={`h-2.5 rounded-full transition-all duration-500 ${
                data.percentage === 100 ? "bg-emerald-500" : data.percentage > 70 ? "bg-indigo-600" : "bg-amber-500"
              }`}
              style={{ width: `${Math.min(100, Math.max(2, data.percentage))}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">Target: 100% for full birthday coverage</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, roll number, admission no, email, or bus number..."
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Role Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
            {[
              { key: "ALL", label: "All Roles" },
              { key: "STUDENT", label: "Students" },
              { key: "TEACHER", label: "Teachers" },
              { key: "STAFF", label: "Staff" },
              { key: "ADMIN", label: "Admins" },
              { key: "PARENT", label: "Parents" },
              { key: "DRIVER", label: "Drivers" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setRoleFilter(tab.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                  roleFilter === tab.key
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Class Filter (active when student role is selected or all) */}
          {(roleFilter === "ALL" || roleFilter === "STUDENT") && (
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 py-2 px-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} - {c.section}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {filteredPeople.length === 0 ? (
          <div className="text-center py-16 px-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {data.totalMissing === 0 ? "All Records Complete!" : "No Missing Records Match Your Filter"}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto mt-1">
              {data.totalMissing === 0
                ? "Every person in the system has a valid Date of Birth. Automatic birthday wishes will reach everyone."
                : "Try clearing search filters or selecting a different role."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
              <thead className="bg-gray-50 dark:bg-gray-900/60 text-xs uppercase text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th scope="col" className="px-4 py-3">Person Name</th>
                  <th scope="col" className="px-4 py-3">Role</th>
                  <th scope="col" className="px-4 py-3">Identifier / Details</th>
                  <th scope="col" className="px-4 py-3">Enter Date of Birth</th>
                  <th scope="col" className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredPeople.map((person) => {
                  const isSaving = savingId === person.id;
                  const isSuccess = successIds.has(person.id);
                  const errorMsg = rowErrors[person.id];
                  const currentVal = editingDates[person.id] || "";

                  return (
                    <tr
                      key={person.id}
                      className={`transition-colors ${
                        isSuccess
                          ? "bg-emerald-50 dark:bg-emerald-950/20"
                          : "hover:bg-gray-50/70 dark:hover:bg-gray-750"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{person.name}</div>
                        {person.className && (
                          <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                            {person.className}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">{roleBadge(person.role)}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300 font-mono">
                        {person.identifier}
                        {!person.hasPortalAccount && person.role === "DRIVER" && (
                          <span className="block text-[10px] text-amber-600 dark:text-amber-400 font-sans mt-0.5">
                            (Fleet record - no login)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 max-w-[200px]">
                          <input
                            type="date"
                            value={currentVal}
                            onChange={(e) =>
                              setEditingDates((prev) => ({ ...prev, [person.id]: e.target.value }))
                            }
                            max={new Date().toISOString().split("T")[0]}
                            disabled={isSaving || isSuccess}
                            className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                          />
                          {errorMsg && <p className="text-[11px] text-red-500">{errorMsg}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isSuccess ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            <Check className="w-4 h-4" />
                            Saved
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSaveDob(person)}
                            disabled={isSaving || !currentVal}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white shadow-sm transition-colors"
                          >
                            {isSaving ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <Save className="w-3.5 h-3.5" />
                                Save
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bulk Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-gray-200 dark:border-gray-700 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Update Date of Birth from Excel / CSV</h3>
              </div>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setPreviewItems(null);
                  setSelectedFile(null);
                  setCommitMessage(null);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4 overflow-y-auto flex-1">
              {commitMessage && (
                <div
                  className={`p-3 rounded-lg text-sm ${
                    commitMessage.includes("Successfully")
                      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"
                  }`}
                >
                  {commitMessage}
                </div>
              )}

              {/* Upload Dropzone */}
              {!previewItems && (
                <div className="space-y-3">
                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:border-indigo-500 transition-colors">
                    <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      Upload .xlsx, .xls, or .csv file
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Columns recognized: <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">identifier</code> (Roll No / Admission No / Email / Bus No) and <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">dateOfBirth</code> (DD-MM-YYYY or YYYY-MM-DD).
                    </p>
                    <input
                      type="file"
                      accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                      onChange={handleFileChange}
                      className="hidden"
                      id="bulk-dob-upload"
                      disabled={isUploading}
                    />
                    <label
                      htmlFor="bulk-dob-upload"
                      className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white cursor-pointer hover:bg-indigo-700 shadow-sm"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Processing file...
                        </>
                      ) : (
                        "Browse File"
                      )}
                    </label>
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Need a sample template?</span>
                    <button
                      type="button"
                      onClick={handleDownloadDobTemplate}
                      className="text-indigo-600 hover:underline font-medium"
                    >
                      Download CSV Template
                    </button>
                  </div>
                </div>
              )}

              {/* Preview Table */}
              {previewItems && uploadStats && (
                <div className="space-y-4">
                  {/* Stats summary banner */}
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="bg-gray-50 dark:bg-gray-900 p-2 rounded-lg">
                      <div className="text-gray-500">Rows in File</div>
                      <div className="text-base font-bold text-gray-900 dark:text-white">{uploadStats.total}</div>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-950/30 p-2 rounded-lg">
                      <div className="text-emerald-700 dark:text-emerald-400 font-medium">Matched</div>
                      <div className="text-base font-bold text-emerald-600">{uploadStats.matched}</div>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-950/30 p-2 rounded-lg">
                      <div className="text-amber-700 dark:text-amber-400 font-medium">Unmatched</div>
                      <div className="text-base font-bold text-amber-600">{uploadStats.unmatched}</div>
                    </div>
                    <div className="bg-red-50 dark:bg-red-950/30 p-2 rounded-lg">
                      <div className="text-red-700 dark:text-red-400 font-medium">Invalid Date</div>
                      <div className="text-base font-bold text-red-600">{uploadStats.invalid}</div>
                    </div>
                  </div>

                  {/* List preview */}
                  <div className="max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="p-2">Identifier</th>
                          <th className="p-2">Name</th>
                          <th className="p-2">Role</th>
                          <th className="p-2">New DOB</th>
                          <th className="p-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {previewItems.map((item, idx) => (
                          <tr key={idx}>
                            <td className="p-2 font-mono">{item.identifier}</td>
                            <td className="p-2 font-medium text-gray-900 dark:text-white">
                              {item.personName || "—"}
                            </td>
                            <td className="p-2">{item.role ? roleBadge(item.role) : "—"}</td>
                            <td className="p-2 font-mono">{item.newDob}</td>
                            <td className="p-2">
                              {item.status === "MATCHED" ? (
                                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                                  <Check className="w-3.5 h-3.5" /> Ready
                                </span>
                              ) : item.status === "INVALID_DOB" ? (
                                <span className="text-red-500 font-medium flex items-center gap-1">
                                  <AlertCircle className="w-3.5 h-3.5" /> Invalid Date
                                </span>
                              ) : (
                                <span className="text-amber-500 font-medium flex items-center gap-1">
                                  <AlertCircle className="w-3.5 h-3.5" /> Not Found
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowUploadModal(false);
                  setPreviewItems(null);
                  setSelectedFile(null);
                  setCommitMessage(null);
                }}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              {previewItems && uploadStats && uploadStats.matched > 0 && (
                <button
                  type="button"
                  onClick={handleCommitBulk}
                  disabled={isCommitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-50"
                >
                  {isCommitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Applying {uploadStats.matched} updates...
                    </>
                  ) : (
                    `Apply ${uploadStats.matched} Updates`
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
