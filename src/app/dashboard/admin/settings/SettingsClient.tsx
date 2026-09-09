"use client";

import { useState } from "react";
import { Save, Plus, Trash2, Settings2, Globe, Shield, Mail } from "lucide-react";
import { saveSystemSettingAction, deleteSystemSettingAction } from "./actions";
import { SystemSetting } from "@prisma/client";

export default function SettingsClient({ initialSettings }: { initialSettings: SystemSetting[] }) {
  const [settings, setSettings] = useState<SystemSetting[]>(initialSettings);
  const [showAdd, setShowAdd] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Group settings by category
  const groupedSettings = settings.reduce((acc, setting) => {
    if (!acc[setting.category]) acc[setting.category] = [];
    acc[setting.category].push(setting);
    return acc;
  }, {} as Record<string, SystemSetting[]>);

  const categories = Object.keys(groupedSettings).sort();

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const res = await saveSystemSettingAction(formData);
    if (res.error) {
      alert(res.error);
    } else {
      setShowAdd(false);
      e.currentTarget.reset();
      // Temporary optimistic update, page refresh will fetch actual
      setSettings([...settings, {
        id: `temp-${Date.now()}`,
        updatedAt: new Date(),
        key: formData.get("key") as string,
        value: formData.get("value") as string,
        category: formData.get("category") as string
      }]);
    }
    setIsSubmitting(false);
  };

  const handleUpdate = async (key: string, value: string, category: string) => {
    const formData = new FormData();
    formData.set("key", key);
    formData.set("value", value);
    formData.set("category", category);
    const res = await saveSystemSettingAction(formData);
    if (res.error) alert(res.error);
  };

  const handleDelete = async (key: string) => {
    if (confirm(`Are you sure you want to delete setting '${key}'?`)) {
      const res = await deleteSystemSettingAction(key);
      if (res.error) {
        alert(res.error);
      } else {
        setSettings(settings.filter(s => s.key !== key));
      }
    }
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat.toUpperCase()) {
      case 'GENERAL': return <Globe size={18} />;
      case 'SECURITY': return <Shield size={18} />;
      case 'EMAIL': return <Mail size={18} />;
      default: return <Settings2 size={18} />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button 
          onClick={() => setShowAdd(!showAdd)}
          style={{ padding: '0.75rem 1.5rem', backgroundColor: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {showAdd ? "Cancel" : <><Plus size={18} /> Add Setting</>}
        </button>
      </div>

      {showAdd && (
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '2rem', border: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>Add New Setting</h2>
          <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Category *</label>
              <input required name="category" type="text" placeholder="e.g. GENERAL" defaultValue="GENERAL" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', textTransform: 'uppercase' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Key *</label>
              <input required name="key" type="text" placeholder="e.g. SCHOOL_NAME" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Value *</label>
              <input required name="value" type="text" placeholder="Value..." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button disabled={isSubmitting} type="submit" style={{ padding: '0.75rem 2rem', backgroundColor: "var(--success)", color: "var(--success-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}>
                {isSubmitting ? "Saving..." : "Save Setting"}
              </button>
            </div>
          </form>
        </div>
      )}

      {categories.map(category => (
        <div key={category} style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.5rem', background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {getCategoryIcon(category)}
            <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{category}</h3>
          </div>
          
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {groupedSettings[category].map((setting) => (
              <div key={setting.key} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '1rem', alignItems: 'center' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {setting.key}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input 
                    type="text" 
                    defaultValue={setting.value}
                    onBlur={(e) => {
                      if (e.target.value !== setting.value) {
                        handleUpdate(setting.key, e.target.value, setting.category);
                      }
                    }}
                    style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', fontSize: '0.875rem' }} 
                  />
                  <Save size={16} color="var(--text-secondary)" style={{ opacity: 0.5 }} />
                </div>
                <button onClick={() => handleDelete(setting.key)} style={{ background: 'transparent', border: 'none', color: "var(--danger)", cursor: 'pointer', padding: '0.5rem' }}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {categories.length === 0 && !showAdd && (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <Settings2 size={48} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
          <p>No system settings configured.</p>
        </div>
      )}

    </div>
  );
}
