"use client";

import { useState } from "react";
import {
  Eye,
  Save,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Bell,
  Users,
  Shield,
  Loader2,
  ExternalLink,
  Send,
  History,
} from "lucide-react";
import { CakeIcon as Cake } from "@/frontend/components/birthdays/BirthdayIcons";
import Link from "next/link";

function LanguageIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.04 9.5A14.953 14.953 0 013 13m1.8-6h11.4M14 9l6 11m0 0l-3-6m3 6h-6" />
    </svg>
  );
}
import {
  updateBirthdaySettingsAction,
  sendTestBirthdayWishAction,
  triggerSendTodayWishesAction,
} from "@/backend/api/actions/dashboard/admin/birthdays/actions";
import BirthdayWishCard from "@/frontend/components/birthdays/BirthdayWishCard";

interface BirthdaySettingsClientProps {
  initialSettings: any;
  dashboardMeta: {
    schoolNow: { year: number; month: number; day: number; dateString: string };
    hasCronSecret: boolean;
    recentRuns: any[];
  };
}

export default function BirthdaySettingsClient({ initialSettings, dashboardMeta }: BirthdaySettingsClientProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Test wish state
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Manual Trigger state
  const [isTriggeringNow, setIsTriggeringNow] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);

  // Active template preview tab
  const [activeTemplateTab, setActiveTemplateTab] = useState<"CARD" | "STUDENT_PARENT" | "TEACHER" | "STAFF" | "ADMIN">("CARD");

  const handleToggle = (field: string) => {
    setSettings((prev: any) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleTextChange = (field: string, val: string) => {
    setSettings((prev: any) => ({ ...prev, [field]: val }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    const res = await updateBirthdaySettingsAction(settings);
    setIsSaving(false);

    if (res.error) {
      setSaveError(res.error);
    } else {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  const handleSendTest = async () => {
    setIsSendingTest(true);
    setTestResult(null);

    const res = await sendTestBirthdayWishAction();
    setIsSendingTest(false);

    if (res.error) {
      setTestResult(`Error: ${res.error}`);
    } else {
      setTestResult("Test birthday notification dispatched! Check your notifications bell.");
      setTimeout(() => setTestResult(null), 4000);
    }
  };

  const handleTriggerNow = async () => {
    if (!confirm("Trigger today's automated birthday wishes now for all celebrants?")) return;
    setIsTriggeringNow(true);
    setTriggerResult(null);

    const res = await triggerSendTodayWishesAction();
    setIsTriggeringNow(false);

    if ("error" in res && res.error) {
      setTriggerResult(`Error: ${res.error}`);
    } else if ("eligibleCount" in res) {
      setTriggerResult(`Successfully processed today's wishes! Eligible: ${res.eligibleCount}, Sent: ${res.sentCount}, Skipped: ${res.skippedAlreadySent}`);
      setTimeout(() => setTriggerResult(null), 6000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <Cake className="w-7 h-7 text-amber-500" />
            Automatic Birthday Wishes
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure automated daily greetings sent from &quot;SRT School&quot; to students&apos; parents, teachers, staff, admins, and students.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/admin/birthdays/missing"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm"
          >
            <Users className="w-4 h-4 text-indigo-500" />
            Missing DOB Records
            <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
          </Link>

          <button
            type="button"
            onClick={handleTriggerNow}
            disabled={isTriggeringNow}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white shadow-sm transition-colors"
            title="Immediately evaluate and send birthday wishes for today"
          >
            {isTriggeringNow ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {isTriggeringNow ? "Evaluating..." : "Trigger Today's Wishes"}
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-sm transition-colors"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSaving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>

      {triggerResult && (
        <div className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
          triggerResult.startsWith("Error")
            ? "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300"
            : "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-300"
        }`}>
          <Cake className="w-4 h-4 flex-shrink-0" />
          {triggerResult}
        </div>
      )}

      {saveSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          Settings saved successfully. All changes are live.
        </div>
      )}

      {saveError && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-xs font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {saveError}
        </div>
      )}

      {/* Main Switch Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              Master Birthday Wishes Switch
              {settings.enabled ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                  Paused
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              When enabled, the automated system checks daily for birthdays and delivers warm wishes from SRT School.
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleToggle("enabled")}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.enabled ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-600"
              }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.enabled ? "translate-x-5" : "translate-x-0"
                }`}
            />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Schedules & Audiences */}
        <div className="space-y-6">
          {/* Timing and Language */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              Timing & Language
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Daily Send Time (Asia/Kolkata IST)
                </label>
                <input
                  type="time"
                  value={settings.sendTimeLocal || settings.sendTime || "07:00"}
                  onChange={(e) => {
                    handleTextChange("sendTimeLocal", e.target.value);
                    handleTextChange("sendTime", e.target.value);
                  }}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
                <p className="text-[11px] text-gray-400 mt-1">Default: 07:00 AM IST (wishes arrive early morning)</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1.5">
                  <LanguageIcon className="w-3.5 h-3.5 text-indigo-500" />
                  Language
                </label>
                <select
                  value={settings.language || "EN"}
                  onChange={(e) => handleTextChange("language", e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                >
                  <option value="EN">English Only</option>
                  <option value="TA">Tamil Only (தமிழ்)</option>
                  <option value="BOTH">Bilingual (English + Tamil)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Audience Toggles */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" />
              Target Audiences
            </h3>

            <div className="space-y-3">
              {[
                {
                  key: "notifyParents",
                  label: "Parents of Students",
                  desc: "Parent receives wish for their child's birthday",
                },
                {
                  key: "notifyClassTeacher",
                  label: "Class Teacher Digest",
                  desc: "Send a consolidated notification to the class teacher when students celebrate",
                },
                {
                  key: "notifyTeachers",
                  label: "Teachers",
                  desc: "Congratulate teachers on their birthday",
                },
                {
                  key: "notifyStaff",
                  label: "Non-Teaching Staff",
                  desc: "Send warm wishes to admin & office staff",
                },
                {
                  key: "notifyAdmins",
                  label: "Administrators",
                  desc: "Send birthday greetings to school administrators",
                },
                {
                  key: "notifyStudents",
                  label: "Student Accounts",
                  desc: "Display celebration banner on student login",
                },
                {
                  key: "whatsappShortcut",
                  label: "WhatsApp Wish Shortcut",
                  desc: "Allow class teachers to send 1-tap WhatsApp greetings to parents",
                },
                {
                  key: "subjectTeachersCanViewBirthdays",
                  label: "Switch A: Subject Teachers Can View Birthdays",
                  desc: "Allow subject teachers to see today's celebrants for classes they teach (names only, no raw DOB)",
                },
                {
                  key: "subjectTeachersCanEnterDob",
                  label: "Switch B: Subject Teachers Can Enter Missing DOB",
                  desc: "Permit subject teachers to enter missing student dates of birth for classes they teach",
                },
                {
                  key: "teacherCanEditExistingDob",
                  label: "Allow Teachers to Edit Existing DOBs",
                  desc: "Permit class teachers to update previously saved student dates",
                },
                {
                  key: "requireAdminApprovalForDobChange",
                  label: "Require Admin Approval for Date Changes",
                  desc: "Teacher date changes must be approved in Admin Approval Log",
                },
              ].map((item) => (
                <div key={item.key} className="flex items-start justify-between py-1">
                  <div>
                    <div className="text-xs font-medium text-gray-900 dark:text-white">{item.label}</div>
                    <div className="text-[11px] text-gray-400">{item.desc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(settings[item.key])}
                    onChange={() => handleToggle(item.key)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mt-0.5"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* System Status Box */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-600" />
              System Status
            </h3>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-gray-100 dark:border-gray-700">
                <span className="text-gray-500">School Timezone:</span>
                <span className="font-semibold text-gray-900 dark:text-white">Asia/Kolkata (IST)</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-100 dark:border-gray-700">
                <span className="text-gray-500">Today&apos;s School Date:</span>
                <span className="font-mono text-gray-900 dark:text-white font-semibold">
                  {dashboardMeta.schoolNow.dateString}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-100 dark:border-gray-700">
                <span className="text-gray-500">CRON_SECRET Configured:</span>
                {dashboardMeta.hasCronSecret ? (
                  <span className="text-emerald-600 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Yes
                  </span>
                ) : (
                  <span className="text-amber-500 font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Not Set
                  </span>
                )}
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-gray-500">Idempotency Guarantee:</span>
                <span className="text-emerald-600 font-medium">1 Wish / Year / Recipient</span>
              </div>
            </div>

            {/* Test Button */}
            <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
              <button
                type="button"
                onClick={handleSendTest}
                disabled={isSendingTest}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 transition-colors"
              >
                {isSendingTest ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Send Test Wish to My Account
              </button>
              {testResult && (
                <p className={`text-[11px] mt-2 text-center ${testResult.startsWith("Error") ? "text-red-500" : "text-emerald-600"}`}>
                  {testResult}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Templates and Live Preview */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Greeting Message Templates</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Placeholders available: <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-[11px]">&#123;name&#125;</code>, <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-[11px]">&#123;studentName&#125;</code>, <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-[11px]">&#123;className&#125;</code>
                </p>
              </div>
            </div>

            {/* Template Selector Tabs */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 gap-4 text-xs font-medium">
              {[
                { id: "CARD", label: "Official Birthday Card" },
                { id: "STUDENT_PARENT", label: "Student & Parent" },
                { id: "TEACHER", label: "Teacher" },
                { id: "STAFF", label: "Staff" },
                { id: "ADMIN", label: "Admin" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTemplateTab(tab.id as any)}
                  className={`pb-2 border-b-2 transition-colors ${activeTemplateTab === tab.id
                      ? "border-amber-600 text-amber-600 dark:text-amber-400 font-bold"
                      : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Official Birthday Card Editor & Live Interactive Preview */}
            {activeTemplateTab === "CARD" && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Correspondent / Sender Name
                    </label>
                    <input
                      type="text"
                      value={settings.senderName ?? "PRANAV.J"}
                      onChange={(e) => handleTextChange("senderName", e.target.value)}
                      placeholder="e.g. PRANAV.J"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Designation
                    </label>
                    <input
                      type="text"
                      value={settings.senderDesignation ?? "Correspondent"}
                      onChange={(e) => handleTextChange("senderDesignation", e.target.value)}
                      placeholder="e.g. Correspondent"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Deity / God Name in Prayer
                    </label>
                    <input
                      type="text"
                      value={settings.deityName ?? "Amman"}
                      onChange={(e) => handleTextChange("deityName", e.target.value)}
                      placeholder="e.g. Amman"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Card Message Line 1 (Greeting)
                    </label>
                    <input
                      type="text"
                      value={settings.cardLine1 ?? "I have great pleasure in conveying my best wishes on the eve of your birthday"}
                      onChange={(e) => handleTextChange("cardLine1", e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Card Message Line 2 (Blessings) &bull; Use <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">&#123;deityName&#125;</code> for deity substitution
                    </label>
                    <input
                      type="text"
                      value={settings.cardLine2 ?? "My prayers are to {deityName} to bless you with peace, prosperity and happiness"}
                      onChange={(e) => handleTextChange("cardLine2", e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>

                {/* Live Interactive Designed Card Preview */}
                <div className="pt-2">
                  <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" />
                    Live Designed Card Preview (Sample Celebrant: Anushka A)
                  </div>

                  <div className="p-3 sm:p-5 rounded-2xl bg-slate-900/10 dark:bg-slate-950/40 border border-amber-500/20 flex justify-center">
                    <BirthdayWishCard
                      recipientName="Anushka A"
                      classNameLabel="Class 10-A"
                      deityName={settings.deityName || "Amman"}
                      cardLine1={settings.cardLine1}
                      cardLine2={settings.cardLine2}
                      senderName={settings.senderName}
                      senderDesignation={settings.senderDesignation}
                      schoolName="SRT SCHOOL"
                      schoolLogo="/logo/srt-logo.svg"
                      schoolTagline="Universal School"
                      ammanPhotoUrl="/assets/birthday/amman.jpg"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Template Editors */}
            {activeTemplateTab === "STUDENT_PARENT" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    English Message (Sent to Parents)
                  </label>
                  <textarea
                    rows={3}
                    value={
                      settings.parentTemplateEn ||
                      "Dear Parent, SRT School wishes {studentName} a very happy birthday! May this year bring happiness, good health, and abundant success. - SRT Universal School"
                    }
                    onChange={(e) => handleTextChange("parentTemplateEn", e.target.value)}
                    className="w-full p-2.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Tamil Message (தமிழ்)
                  </label>
                  <textarea
                    rows={3}
                    value={
                      settings.parentTemplateTa ||
                      "அன்புள்ள பெற்றோருக்கு, {studentName}-க்கு SRT பள்ளி பிறந்தநாள் நல்வாழ்த்துகளைத் தெரிவித்துக் கொள்கிறது! - SRT Universal School"
                    }
                    onChange={(e) => handleTextChange("parentTemplateTa", e.target.value)}
                    className="w-full p-2.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                </div>

                {/* Live Preview Card */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-200 dark:border-amber-900/50">
                  <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" />
                    Live Notification Preview (Parent View)
                  </div>
                  <div className="text-xs font-bold text-gray-900 dark:text-white">
                    Happy Birthday, Aarav Sharma! 🎂
                  </div>
                  <p className="text-xs text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-line">
                    {(settings.language === "TA"
                      ? settings.parentTemplateTa
                      : settings.language === "BOTH"
                        ? `${settings.parentTemplateEn || ""}\n\n${settings.parentTemplateTa || ""}`
                        : settings.parentTemplateEn) ||
                      "Dear Parent, SRT School wishes Aarav Sharma a very happy birthday! May this year bring happiness, good health, and abundant success. - SRT Universal School"
                    }
                  </p>
                </div>
              </div>
            )}

            {activeTemplateTab === "TEACHER" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    English Message (Sent to Teachers)
                  </label>
                  <textarea
                    rows={3}
                    value={
                      settings.teacherTemplateEn ||
                      "Dear {name}, SRT School wishes you a very Happy Birthday! Thank you for your dedication and wonderful service to our students. Have a fantastic year ahead! - SRT Universal School"
                    }
                    onChange={(e) => handleTextChange("teacherTemplateEn", e.target.value)}
                    className="w-full p-2.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Tamil Message (தமிழ்)
                  </label>
                  <textarea
                    rows={3}
                    value={
                      settings.teacherTemplateTa ||
                      "வணக்கம் {name}, SRT பள்ளி தங்களுக்கு மனமார்ந்த பிறந்தநாள் நல்வாழ்த்துகளைத் தெரிவித்துக் கொள்கிறது! - SRT Universal School"
                    }
                    onChange={(e) => handleTextChange("teacherTemplateTa", e.target.value)}
                    className="w-full p-2.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
            )}

            {activeTemplateTab === "STAFF" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    English Message (Sent to Staff)
                  </label>
                  <textarea
                    rows={3}
                    value={
                      settings.staffTemplateEn ||
                      "Dear {name}, SRT School wishes you a very Happy Birthday! Thank you for your valuable support and contribution. - SRT Universal School"
                    }
                    onChange={(e) => handleTextChange("staffTemplateEn", e.target.value)}
                    className="w-full p-2.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
            )}

            {activeTemplateTab === "ADMIN" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    English Message (Sent to Administrators)
                  </label>
                  <textarea
                    rows={3}
                    value={
                      settings.adminTemplateEn ||
                      "Dear {name}, SRT School wishes you a very Happy Birthday! Thank you for your leadership and guidance. - SRT Universal School"
                    }
                    onChange={(e) => handleTextChange("adminTemplateEn", e.target.value)}
                    className="w-full p-2.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Recent Cron Job Execution History */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-600" />
              Recent Dispatch Runs
            </h3>

            {dashboardMeta.recentRuns.length === 0 ? (
              <p className="text-xs text-gray-400 py-3 text-center">
                No past runs recorded yet. The scheduler will record every daily run here.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-600 dark:text-gray-300">
                  <thead className="bg-gray-50 dark:bg-gray-900 text-[11px] uppercase border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="p-2">Run Date</th>
                      <th className="p-2">Status</th>
                      <th className="p-2 text-right">Eligible</th>
                      <th className="p-2 text-right">Sent</th>
                      <th className="p-2 text-right">Skipped</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {dashboardMeta.recentRuns.map((r: any) => (
                      <tr key={r.id}>
                        <td className="p-2 font-mono">{r.forDate}</td>
                        <td className="p-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${r.failedCount === 0
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                                : "bg-amber-100 text-amber-800"
                              }`}
                          >
                            {r.failedCount === 0 ? "SUCCESS" : "PARTIAL"}
                          </span>
                        </td>
                        <td className="p-2 text-right">{r.sentCount + (r.skippedAlreadySent || 0) + (r.skippedNoAccount || 0)}</td>
                        <td className="p-2 text-right font-semibold text-emerald-600">{r.sentCount}</td>
                        <td className="p-2 text-right text-gray-400">{(r.skippedAlreadySent || 0) + (r.skippedNoAccount || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
