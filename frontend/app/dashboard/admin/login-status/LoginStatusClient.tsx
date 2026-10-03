"use client";

import { useState } from "react";
import { Search, CheckCircle2, XCircle, Clock } from "lucide-react";
import { LoginAttempt } from "@prisma/client";

export default function LoginStatusClient({ records }: { records: LoginAttempt[] }) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredRecords = records.filter((record) => {
    return record.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
           (record.ipAddress || "").includes(searchTerm);
  });

  return (
    <div style={{ marginTop: '2rem', background: 'var(--card-bg)', borderRadius: '12px', padding: '1.5rem', border: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
          <input 
            type="text" 
            placeholder="Search email, IP address..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'transparent', color: 'inherit' }}
          />
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-color)", backgroundColor: 'rgba(0,0,0,0.02)' }}>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Email ID</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Date & Timing</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Status</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>IP Address</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>User Agent</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.map((record) => (
              <tr key={record.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                <td style={{ padding: "1rem", fontSize: '0.875rem', fontWeight: 500 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600 }}>
                      {record.email.charAt(0).toUpperCase()}
                    </div>
                    {record.email}
                  </div>
                </td>
                <td style={{ padding: "1rem", fontSize: '0.875rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.9 }}>
                    <Clock size={14} />
                    {new Date(record.timestamp).toLocaleString()}
                  </div>
                </td>
                <td style={{ padding: "1rem" }}>
                  {record.success ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: "var(--success)", fontSize: '0.875rem', background: 'var(--success-bg)', padding: '0.25rem 0.5rem', borderRadius: '999px' }}>
                      <CheckCircle2 size={14} /> Success
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: "var(--danger)", fontSize: '0.875rem', background: 'var(--danger-bg)', padding: '0.25rem 0.5rem', borderRadius: '999px' }}>
                      <XCircle size={14} /> Failed
                    </span>
                  )}
                </td>
                <td style={{ padding: "1rem", fontSize: '0.875rem', opacity: 0.8 }}>
                  {record.ipAddress || "N/A"}
                </td>
                <td style={{ padding: "1rem", fontSize: '0.875rem', opacity: 0.8, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={record.userAgent || ""}>
                  {record.userAgent || "N/A"}
                </td>
                <td style={{ padding: "1rem", fontSize: '0.875rem', textAlign: 'center' }}>
                  <a 
                    href={`mailto:${record.email}?subject=Security Notice: Login Activity on Your Portal Account&body=Hello,%0D%0A%0D%0AWe are writing to inform you of a recent login attempt on your account.%0D%0A%0D%0ATime: ${new Date(record.timestamp).toLocaleString()}%0D%0AStatus: ${record.success ? 'Success' : 'Failed'}%0D%0AIP Address: ${record.ipAddress || 'Unknown'}%0D%0A%0D%0AIf this was not you, please contact the administrator immediately.`}
                    style={{ 
                      padding: '0.4rem 0.8rem', 
                      backgroundColor: 'var(--primary-bg)', 
                      color: 'var(--primary)', 
                      borderRadius: '6px', 
                      textDecoration: 'none', 
                      fontWeight: 500,
                      display: 'inline-block' 
                    }}
                  >
                    Report
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {filteredRecords.length === 0 && (
          <p style={{ textAlign: 'center', opacity: 0.7, padding: '2rem' }}>No login records found.</p>
        )}
      </div>
    </div>
  );
}
