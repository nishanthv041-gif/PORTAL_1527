"use client";

import { useState } from "react";
import { saveSystemSettingsBatchAction } from "@/backend/api/actions/dashboard/admin/settings/actions";
import { SystemSetting } from "@prisma/client";
import {
  Building2, Users, Shield, GraduationCap, CalendarCheck,
  Wallet, Bell, FileSpreadsheet, Lock, Globe, Database,
  Server, Save, Loader2, CheckCircle2
} from "lucide-react";
import styles from "./settings.module.css";

const SETTINGS_CATEGORIES = [
  {
    id: "SCHOOL",
    label: "School Information",
    icon: <Building2 size={18} />,
    fields: [
      { key: "SCHOOL_NAME", label: "School Name", type: "text", default: "My School" },
      { key: "SCHOOL_LOGO", label: "School Logo", type: "image", default: "" },
      { key: "SCHOOL_ADDRESS", label: "Address", type: "textarea", default: "" },
      { key: "SCHOOL_CONTACT", label: "Contact Number", type: "text", default: "" },
      { key: "SCHOOL_EMAIL", label: "Email", type: "email", default: "" }
    ]
  },
  {
    id: "USERS",
    label: "User Management",
    icon: <Users size={18} />,
    fields: [
      { key: "ALLOW_ADMIN_REGISTRATION", label: "Admin Registration", type: "boolean", default: "false" },
      { key: "ALLOW_TEACHER_REGISTRATION", label: "Teacher Accounts Creation", type: "boolean", default: "true" },
      { key: "ALLOW_PARENT_REGISTRATION", label: "Parent Accounts Creation", type: "boolean", default: "true" },
      { key: "ALLOW_STUDENT_REGISTRATION", label: "Student Accounts Creation", type: "boolean", default: "true" },
      { key: "REQUIRE_APPROVAL_NEW_USERS", label: "Require Approval for New Users", type: "boolean", default: "true" }
    ]
  },
  {
    id: "ROLES",
    label: "Role & Permissions",
    icon: <Shield size={18} />,
    fields: [
      { key: "TEACHER_MANAGE_ATTENDANCE", label: "Teachers can manage Attendance", type: "boolean", default: "true" },
      { key: "TEACHER_MANAGE_MARKS", label: "Teachers can manage Marks", type: "boolean", default: "true" },
      { key: "PARENT_VIEW_ANALYTICS", label: "Parents can view Class Analytics", type: "boolean", default: "false" },
      { key: "PARENT_ADMIN_PERMISSIONS", label: "Enable Parent Admin (PTA) roles", type: "boolean", default: "false" }
    ]
  },
  {
    id: "ACADEMIC",
    label: "Academic Settings",
    icon: <GraduationCap size={18} />,
    fields: [
      { key: "ACADEMIC_YEAR", label: "Current Academic Year", type: "text", default: "2023-2024" },
      { key: "TERMS_SEMESTERS", label: "Number of Terms/Semesters", type: "select", options: ["1", "2", "3", "4"], default: "2" },
      { key: "DEFAULT_PASSING_MARKS", label: "Default Passing Marks (%)", type: "number", default: "40" }
    ]
  },
  {
    id: "ATTENDANCE",
    label: "Attendance Settings",
    icon: <CalendarCheck size={18} />,
    fields: [
      { key: "ATTENDANCE_TYPE", label: "Attendance Type", type: "select", options: ["Daily", "Subject-wise"], default: "Daily" },
      { key: "PARENT_ATTENDANCE_VISIBILITY", label: "Parent Attendance Visibility", type: "boolean", default: "true" },
      { key: "ATTENDANCE_NOTIFICATIONS", label: "Send Automated Absent Notifications", type: "boolean", default: "true" }
    ]
  },
  {
    id: "FEES",
    label: "Fee Settings",
    icon: <Wallet size={18} />,
    fields: [
      { key: "FEE_CURRENCY", label: "Default Currency Symbol", type: "text", default: "$" },
      { key: "LATE_FEE_ENABLED", label: "Enable Late Fee Charges", type: "boolean", default: "false" },
      { key: "RECEIPT_PREFIX", label: "Receipt Number Prefix", type: "text", default: "REC-" }
    ]
  },
  {
    id: "NOTIFICATIONS",
    label: "Notification Settings",
    icon: <Bell size={18} />,
    fields: [
      { key: "EMAIL_NOTIFICATIONS", label: "Enable Email Notifications", type: "boolean", default: "true" },
      { key: "SMS_NOTIFICATIONS", label: "Enable SMS Notifications", type: "boolean", default: "false" },
      { key: "APP_NOTIFICATIONS", label: "Enable In-App Alerts", type: "boolean", default: "true" },
      { key: "FEE_ALERTS", label: "Automated Fee Reminders", type: "boolean", default: "true" },
      { key: "EXAM_RESULT_ALERTS", label: "Exam Result Publications", type: "boolean", default: "true" }
    ]
  },
  {
    id: "EXAMS",
    label: "Exam & Result Settings",
    icon: <FileSpreadsheet size={18} />,
    fields: [
      { key: "GRADE_SYSTEM", label: "Grading System", type: "select", options: ["GPA (0-4.0)", "Percentage (0-100)", "Letters (A-F)"], default: "Percentage (0-100)" },
      { key: "RESULT_VISIBILITY", label: "Publish Results Automatically", type: "boolean", default: "false" }
    ]
  },
  {
    id: "SECURITY",
    label: "Security Settings",
    icon: <Lock size={18} />,
    fields: [
      { key: "PASSWORD_POLICY", label: "Enforce Strong Passwords", type: "boolean", default: "true" },
      { key: "SESSION_TIMEOUT", label: "Session Timeout (minutes)", type: "number", default: "120" },
      { key: "TWO_FACTOR_AUTH", label: "Require 2FA for Admins", type: "boolean", default: "false" }
    ]
  },
  {
    id: "GENERAL",
    label: "General Settings",
    icon: <Globe size={18} />,
    fields: [
      { key: "LANGUAGE", label: "Default Language", type: "select", options: ["English", "Spanish", "French", "German"], default: "English" },
      { key: "TIME_ZONE", label: "Time Zone", type: "text", default: "UTC" },
      { key: "DATE_FORMAT", label: "Date Format", type: "select", options: ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"], default: "MM/DD/YYYY" },
      { key: "THEME_MODE", label: "Default Theme Mode", type: "select", options: ["Light", "Dark", "System"], default: "System" }
    ]
  },
  {
    id: "SYSTEM",
    label: "System",
    icon: <Server size={18} />,
    fields: [
      { key: "MAINTENANCE_MODE", label: "Maintenance Mode", type: "boolean", default: "false" },
      { key: "SYSTEM_LOGS", label: "Enable Verbose System Logging", type: "boolean", default: "false" }
    ]
  }
];

export default function SettingsClient({ initialSettings }: { initialSettings: SystemSetting[] }) {
  const [activeTab, setActiveTab] = useState(SETTINGS_CATEGORIES[0].id);
  const [settingsValues, setSettingsValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    initialSettings.forEach(s => { initial[s.key] = s.value; });
    return initial;
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const activeCategory = SETTINGS_CATEGORIES.find(c => c.id === activeTab)!;

  const handleChange = (key: string, value: string) => {
    setSettingsValues(prev => ({ ...prev, [key]: value }));
    setSaveSuccess(false);
  };

  const handleActivateAll = async () => {
    if (window.confirm("IMPORTANT: Activating all options is on your own responsibility. Do you want to proceed?")) {
      const nextValues = { ...settingsValues };
      const batch: any[] = [];
      
      SETTINGS_CATEGORIES.forEach(category => {
        category.fields.forEach(field => {
          if (field.type === 'boolean') {
            nextValues[field.key] = 'true';
          }
          batch.push({
            key: field.key,
            value: nextValues[field.key] !== undefined ? nextValues[field.key] : field.default,
            category: category.id
          });
        });
      });
      
      setSettingsValues(nextValues);
      setIsSubmitting(true);
      setSaveSuccess(false);
      
      const res = await saveSystemSettingsBatchAction(batch);
      if (res.error) {
        alert("Failed to save settings: " + res.error);
      } else {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
      setIsSubmitting(false);
    }
  };

  const handleSaveAll = async () => {
    setIsSubmitting(true);
    setSaveSuccess(false);

    const batch = [];
    for (const category of SETTINGS_CATEGORIES) {
      for (const field of category.fields) {
        batch.push({
          key: field.key,
          value: settingsValues[field.key] !== undefined ? settingsValues[field.key] : field.default,
          category: category.id
        });
      }
    }

    const res = await saveSystemSettingsBatchAction(batch);
    if (res.error) {
      alert("Failed to save settings: " + res.error);
    } else {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
    setIsSubmitting(false);
  };

  return (
    <div className={styles.container}>

      {/* Sidebar Navigation */}
      <div className={styles.sidebar}>
        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.02)' }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>System Settings</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', padding: '0.5rem' }}>
          {SETTINGS_CATEGORIES.map(category => (
            <button
              key={category.id}
              onClick={() => setActiveTab(category.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem',
                border: 'none', background: activeTab === category.id ? 'var(--primary-bg)' : 'transparent',
                color: activeTab === category.id ? 'var(--primary)' : 'var(--text-primary)',
                textAlign: 'left', borderRadius: '8px', cursor: 'pointer', fontWeight: activeTab === category.id ? 600 : 400,
                transition: 'all 0.2s ease'
              }}
            >
              {category.icon}
              {category.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className={styles.mainContent}>

        {/* Header */}
        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ color: 'var(--primary)' }}>{activeCategory.icon}</div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{activeCategory.label}</h2>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={handleActivateAll}
              disabled={isSubmitting}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem',
                backgroundColor: 'transparent',
                color: '#ef4444',
                border: '1px solid #ef4444', borderRadius: '8px', fontWeight: 500, cursor: isSubmitting ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease', whiteSpace: 'nowrap'
              }}
              title="Activate all boolean options"
            >
              <CheckCircle2 size={18} />
              Activate All Options
            </button>
            <button
              onClick={handleSaveAll}
              disabled={isSubmitting}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem',
                backgroundColor: saveSuccess ? 'var(--success)' : 'var(--primary)',
                color: saveSuccess ? 'var(--success-fg)' : 'var(--primary-fg)',
                border: 'none', borderRadius: '8px', fontWeight: 500, cursor: isSubmitting ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease', whiteSpace: 'nowrap'
              }}
            >
              {isSubmitting ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> :
                saveSuccess ? <CheckCircle2 size={18} /> : <Save size={18} />}
              {isSubmitting ? 'Saving...' : saveSuccess ? 'Saved All!' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Fields */}
        <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {activeCategory.fields.map(field => {
            const currentValue = settingsValues[field.key] !== undefined ? settingsValues[field.key] : field.default;

            return (
              <div key={field.key} className={`${styles.fieldRow} ${field.type === 'textarea' ? styles.textareaRow : ''}`}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                    {field.label}
                  </label>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{field.key}</span>
                  {field.key === "SCHOOL_LOGO" && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#ef4444', fontWeight: 600 }}>
                      * IMPORTANT: Setting this logo is on your own responsibility.
                    </div>
                  )}
                </div>

                <div style={{ width: '100%', maxWidth: '400px' }}>
                  {field.type === 'boolean' ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '0.5rem 0' }}>
                      <div style={{
                        width: '44px', height: '24px', borderRadius: '12px',
                        background: currentValue === 'true' ? 'var(--primary)' : 'var(--border-color)',
                        position: 'relative', transition: 'all 0.2s', pointerEvents: 'none'
                      }}>
                        <div style={{
                          width: '20px', height: '20px', borderRadius: '50%', background: 'white',
                          position: 'absolute', top: '2px', left: currentValue === 'true' ? '22px' : '2px',
                          transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }} />
                      </div>
                      <input
                        type="checkbox"
                        checked={currentValue === 'true'}
                        onChange={(e) => handleChange(field.key, e.target.checked ? 'true' : 'false')}
                        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                      />
                      <span style={{ fontSize: '0.875rem', fontWeight: 500, color: currentValue === 'true' ? 'var(--success)' : 'var(--text-secondary)' }}>
                        {currentValue === 'true' ? 'Enabled' : 'Disabled'}
                      </span>
                    </label>
                  ) : field.type === 'select' ? (
                    <select
                      value={currentValue}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', fontSize: '0.9rem' }}
                    >
                      {field.options?.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : field.type === 'image' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ 
                        width: '80px', height: '80px', borderRadius: '50%', overflow: 'hidden', 
                        padding: '3px',
                        background: 'linear-gradient(135deg, #3b82f6, #ec4899)',
                        boxShadow: '0 4px 12px rgba(236, 72, 153, 0.2)',
                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                        flexShrink: 0
                      }}>
                        {currentValue ? (
                          <img src={currentValue} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', borderRadius: '50%', backgroundColor: 'var(--primary-bg)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            <Building2 size={32} style={{ color: 'var(--text-secondary)' }} />
                          </div>
                        )}
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              handleChange(field.key, event.target?.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', fontSize: '0.9rem' }}
                      />
                    </div>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      value={currentValue}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      rows={4}
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', fontSize: '0.9rem', resize: 'vertical' }}
                    />
                  ) : (
                    <input
                      type={field.type}
                      value={currentValue}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', fontSize: '0.9rem' }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
