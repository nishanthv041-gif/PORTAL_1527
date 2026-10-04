"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  School, Users, ShieldCheck, BookOpen, CalendarCheck, 
  CreditCard, Bell, FileText, Lock, Globe, Database, 
  AlertTriangle, Save, ExternalLink
} from "lucide-react";
import { saveSystemSettingAction } from "@/backend/api/actions/dashboard/admin/settings/actions";
import { SystemSetting } from "@prisma/client";

const CATEGORIES = [
  { id: "SCHOOL_INFO", label: "School Information", icon: School },
  { id: "USER_MANAGEMENT", label: "User Management", icon: Users },
  { id: "ROLES", label: "Role & Permissions", icon: ShieldCheck },
  { id: "ACADEMIC", label: "Academic Settings", icon: BookOpen },
  { id: "ATTENDANCE", label: "Attendance Settings", icon: CalendarCheck },
  { id: "FEES", label: "Fee Settings", icon: CreditCard },
  { id: "NOTIFICATIONS", label: "Notification Settings", icon: Bell },
  { id: "EXAMS", label: "Exam & Result Settings", icon: FileText },
  { id: "SECURITY", label: "Security Settings", icon: Lock },
  { id: "GENERAL", label: "General Settings", icon: Globe },
  { id: "BACKUP", label: "Backup & Data", icon: Database },
  { id: "SYSTEM", label: "System", icon: AlertTriangle },
];

export default function SettingsClient({ initialSettings }: { initialSettings: SystemSetting[] }) {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState("SCHOOL_INFO");
  const [settings, setSettings] = useState<SystemSetting[]>(initialSettings);
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({});

  const getSetting = (key: string, defaultValue = "") => {
    return settings.find(s => s.key === key)?.value || defaultValue;
  };

  const handleUpdate = async (key: string, value: string, category: string) => {
    setSavingKeys(prev => ({ ...prev, [key]: true }));
    const formData = new FormData();
    formData.set("key", key);
    formData.set("value", value);
    formData.set("category", category);
    
    const res = await saveSystemSettingAction(formData);
    if (!res.error) {
      setSettings(prev => {
        const existing = prev.find(s => s.key === key);
        if (existing) return prev.map(s => s.key === key ? { ...s, value } : s);
        return [...prev, { id: 'temp', key, value, category, updatedAt: new Date() }];
      });
      router.refresh();
    } else {
      alert(res.error);
    }
    setSavingKeys(prev => ({ ...prev, [key]: false }));
  };

  const SettingRow = ({ label, settingKey, category, type = "text", options = [] }: { label: string, settingKey: string, category: string, type?: "text" | "toggle" | "select", options?: {label: string, value: string}[] }) => {
    const value = getSetting(settingKey);
    const isSaving = savingKeys[settingKey];

    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>{label}</h4>
        </div>
        <div style={{ width: '300px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {type === "text" && (
            <input 
              type="text" 
              defaultValue={value}
              onBlur={(e) => {
                if (e.target.value !== value) handleUpdate(settingKey, e.target.value, category);
              }}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', fontSize: '0.875rem' }} 
            />
          )}
          {type === "toggle" && (
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input 
                type="checkbox"
                checked={value === "true"}
                onChange={(e) => handleUpdate(settingKey, e.target.checked ? "true" : "false", category)}
                style={{ width: '1.25rem', height: '1.25rem' }}
              />
              <span style={{ marginLeft: '0.5rem', fontSize: '0.875rem' }}>{value === "true" ? "Enabled" : "Disabled"}</span>
            </label>
          )}
          {type === "select" && (
            <select
              value={value}
              onChange={(e) => handleUpdate(settingKey, e.target.value, category)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', fontSize: '0.875rem' }}
            >
              <option value="">Select option</option>
              {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          )}
          {isSaving && <Save size={16} color="var(--primary)" style={{ opacity: 0.5, animation: 'pulse 2s infinite' }} />}
        </div>
      </div>
    );
  };

  const PageLink = ({ label, href }: { label: string, href: string }) => (
    <Link href={href} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderBottom: '1px solid var(--border-color)', textDecoration: 'none', color: 'inherit' }}>
      <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 500 }}>{label}</h4>
      <ExternalLink size={16} color="var(--primary)" />
    </Link>
  );

  const ActionButton = ({ label, onClick, variant = "primary" }: { label: string, onClick: () => void, variant?: "primary" | "danger" }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>
      <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 500 }}>{label}</h4>
      <button 
        onClick={onClick}
        style={{ 
          padding: '0.5rem 1rem', 
          backgroundColor: variant === "danger" ? "var(--danger-bg)" : "var(--primary-bg)", 
          color: variant === "danger" ? "var(--danger)" : "var(--primary)", 
          border: 'none', borderRadius: '6px', fontWeight: 500, cursor: 'pointer' 
        }}
      >
        Execute Action
      </button>
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: '2rem', minHeight: '600px', flexDirection: 'column' }}>
      
      {/* Mobile/Responsive note: In a real app we'd use grid for layout, here we use flex row for desktop */}
      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '2rem', alignItems: 'start' }}>
        
        {/* Sidebar */}
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.25rem',
                  border: 'none', background: isActive ? 'var(--primary-bg)' : 'transparent',
                  color: isActive ? 'var(--primary)' : 'var(--text-primary)',
                  cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border-color)',
                  fontWeight: isActive ? 600 : 500, transition: 'all 0.2s'
                }}
              >
                <Icon size={18} />
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.02)' }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
              {CATEGORIES.find(c => c.id === activeCategory)?.label}
            </h2>
          </div>

          <div style={{ padding: '0 1.5rem 1.5rem 1.5rem' }}>
            
            {activeCategory === "SCHOOL_INFO" && (
              <>
                <SettingRow label="School Name" settingKey="SCHOOL_NAME" category={activeCategory} />
                <SettingRow label="School Logo URL" settingKey="SCHOOL_LOGO" category={activeCategory} />
                <SettingRow label="Address" settingKey="SCHOOL_ADDRESS" category={activeCategory} />
                <SettingRow label="Contact Number" settingKey="SCHOOL_PHONE" category={activeCategory} />
                <SettingRow label="Email Address" settingKey="SCHOOL_EMAIL" category={activeCategory} />
              </>
            )}

            {activeCategory === "USER_MANAGEMENT" && (
              <>
                <PageLink label="Admin Users" href="/dashboard/admin/users" />
                <PageLink label="Teacher Accounts" href="/dashboard/admin/teachers" />
                <PageLink label="Parent Accounts" href="/dashboard/admin/parents" />
                <PageLink label="Student Accounts" href="/dashboard/admin/students" />
                <PageLink label="Activate / Deactivate Users" href="/dashboard/admin/users" />
              </>
            )}

            {activeCategory === "ROLES" && (
              <>
                <PageLink label="Manage Custom Roles" href="/dashboard/admin/create-roles" />
                <SettingRow label="Allow Teacher Permissions Override" settingKey="PERM_TEACHER_OVERRIDE" category={activeCategory} type="toggle" />
                <SettingRow label="Allow Parent Account Adjustments" settingKey="PERM_PARENT_ADJUST" category={activeCategory} type="toggle" />
                <SettingRow label="Global Parent Admin Permissions" settingKey="PERM_PARENT_ADMIN" category={activeCategory} type="toggle" />
              </>
            )}

            {activeCategory === "ACADEMIC" && (
              <>
                <SettingRow label="Current Academic Year" settingKey="ACADEMIC_YEAR" category={activeCategory} />
                <SettingRow label="Current Term / Semester" settingKey="CURRENT_TERM" category={activeCategory} select options={[
                  {label: "Term 1", value: "TERM_1"}, {label: "Term 2", value: "TERM_2"}, {label: "Term 3", value: "TERM_3"}
                ]} type="select" />
                <PageLink label="Manage Classes & Sections" href="/dashboard/admin/classes" />
                <PageLink label="Manage Subjects" href="/dashboard/admin/subjects" />
              </>
            )}

            {activeCategory === "ATTENDANCE" && (
              <>
                <SettingRow label="Attendance Type" settingKey="ATTENDANCE_TYPE" category={activeCategory} type="select" options={[
                  {label: "Daily (Once per day)", value: "DAILY"},
                  {label: "Subject-wise (Per period)", value: "SUBJECT"}
                ]} />
                <SettingRow label="Custom Status (Present/Absent/Late)" settingKey="ATTENDANCE_STATUS_CUSTOM" category={activeCategory} type="toggle" />
                <SettingRow label="Parent Attendance Visibility" settingKey="ATTENDANCE_PARENT_VISIBILITY" category={activeCategory} type="toggle" />
                <SettingRow label="Automated Attendance Notifications" settingKey="ATTENDANCE_NOTIFICATIONS" category={activeCategory} type="toggle" />
              </>
            )}

            {activeCategory === "FEES" && (
              <>
                <SettingRow label="Default Fee Currency" settingKey="FEE_CURRENCY" category={activeCategory} type="select" options={[
                  {label: "USD ($)", value: "USD"}, {label: "EUR (€)", value: "EUR"}, {label: "INR (₹)", value: "INR"}
                ]} />
                <SettingRow label="Enable Late Fees" settingKey="FEE_LATE_ENABLED" category={activeCategory} type="toggle" />
                <SettingRow label="Payment Methods Gateway" settingKey="FEE_GATEWAY" category={activeCategory} />
                <SettingRow label="Receipt Generation Prefix" settingKey="FEE_RECEIPT_PREFIX" category={activeCategory} />
              </>
            )}

            {activeCategory === "NOTIFICATIONS" && (
              <>
                <SettingRow label="Global Email Notifications" settingKey="NOTIFY_EMAIL_ENABLED" category={activeCategory} type="toggle" />
                <SettingRow label="Global SMS Notifications" settingKey="NOTIFY_SMS_ENABLED" category={activeCategory} type="toggle" />
                <SettingRow label="In-App Push Notifications" settingKey="NOTIFY_APP_ENABLED" category={activeCategory} type="toggle" />
                <SettingRow label="Daily Attendance Alerts" settingKey="NOTIFY_ATTENDANCE_ALERTS" category={activeCategory} type="toggle" />
                <SettingRow label="Fee Due Alerts" settingKey="NOTIFY_FEE_ALERTS" category={activeCategory} type="toggle" />
                <SettingRow label="Exam Result Notifications" settingKey="NOTIFY_RESULT_ALERTS" category={activeCategory} type="toggle" />
              </>
            )}

            {activeCategory === "EXAMS" && (
              <>
                <SettingRow label="Marks System Strategy" settingKey="EXAM_MARKS_SYSTEM" category={activeCategory} type="select" options={[
                  {label: "Absolute Marks", value: "ABSOLUTE"}, {label: "GPA System", value: "GPA"}
                ]} />
                <SettingRow label="Grade System (A, B, C vs O, A, B)" settingKey="EXAM_GRADE_SYSTEM" category={activeCategory} />
                <SettingRow label="Global Result Visibility to Parents" settingKey="EXAM_RESULT_VISIBILITY" category={activeCategory} type="toggle" />
              </>
            )}

            {activeCategory === "SECURITY" && (
              <>
                <SettingRow label="Strict Password Policy" settingKey="SEC_PASSWORD_POLICY" category={activeCategory} type="toggle" />
                <SettingRow label="Session Timeout (Minutes)" settingKey="SEC_SESSION_TIMEOUT" category={activeCategory} />
                <SettingRow label="Require Two-Factor Authentication" settingKey="SEC_2FA_REQUIRED" category={activeCategory} type="toggle" />
                <PageLink label="Change Admin Password" href="/dashboard/profile" />
                <PageLink label="Login Activity Logs" href="/dashboard/admin/login-status" />
              </>
            )}

            {activeCategory === "GENERAL" && (
              <>
                <SettingRow label="System Language" settingKey="GEN_LANGUAGE" category={activeCategory} type="select" options={[
                  {label: "English", value: "en"}, {label: "Spanish", value: "es"}, {label: "French", value: "fr"}
                ]} />
                <SettingRow label="Time Zone" settingKey="GEN_TIMEZONE" category={activeCategory} />
                <SettingRow label="Date Format" settingKey="GEN_DATE_FORMAT" category={activeCategory} type="select" options={[
                  {label: "MM/DD/YYYY", value: "MM/DD/YYYY"}, {label: "DD/MM/YYYY", value: "DD/MM/YYYY"}, {label: "YYYY-MM-DD", value: "YYYY-MM-DD"}
                ]} />
                <SettingRow label="Default Theme" settingKey="GEN_THEME" category={activeCategory} type="select" options={[
                  {label: "Light Mode", value: "LIGHT"}, {label: "Dark Mode", value: "DARK"}, {label: "System Preference", value: "SYSTEM"}
                ]} />
              </>
            )}

            {activeCategory === "BACKUP" && (
              <>
                <ActionButton label="Generate System Backup" onClick={() => alert("Backup started. Check notifications for completion.")} />
                <ActionButton label="Restore from Backup" onClick={() => alert("Please upload a backup file in the specific module.")} />
                <ActionButton label="Export All Student Data" onClick={() => alert("Data export queued.")} />
              </>
            )}

            {activeCategory === "SYSTEM" && (
              <>
                <SettingRow label="Enable Maintenance Mode" settingKey="SYS_MAINTENANCE_MODE" category={activeCategory} type="toggle" />
                <ActionButton label="Clear System Cache" onClick={() => alert("Cache cleared successfully.")} />
                <PageLink label="View System Logs" href="/dashboard/admin/logs" />
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
