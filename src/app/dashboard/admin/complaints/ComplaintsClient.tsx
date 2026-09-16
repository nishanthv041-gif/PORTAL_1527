"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Calendar, MessageSquare, CheckCircle, Clock, User as UserIcon, Edit2, Trash2 } from "lucide-react";
import { updateComplaintStatusAction } from "@/backend/actions/dashboard/admin/complaints/actions";

import { Complaint, Teacher, User, Student, Class, ParentStudent, Parent } from "@prisma/client";

type ComplaintWithRelations = Complaint & {
  teacher: (Teacher & { user: User }) | null;
  student: (Student & { class: Class | null, parents: (ParentStudent & { parent: Parent })[] }) | null;
};

export default function ComplaintsClient({ complaints }: { complaints: ComplaintWithRelations[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editSeverity, setEditSeverity] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const router = useRouter();

  const startEdit = (complaint: ComplaintWithRelations) => {
    setEditingId(complaint.id);
    setEditStatus(complaint.status);
    setEditRemarks(complaint.remarks || "");
    setEditTitle(complaint.title);
    setEditDescription(complaint.description);
    setEditCategory(complaint.category);
    setEditSeverity(complaint.severity);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this complaint?")) {
      const res = await fetch(`/api/complaints/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const errorData = await res.json();
        alert(errorData.error || "Failed to delete complaint");
      } else {
        router.refresh();
      }
    }
  };

  const handleUpdate = async (id: string) => {
    setIsSubmitting(true);
    // Send PATCH request with all fields
    const res = await fetch(`/api/complaints/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editTitle,
        description: editDescription,
        category: editCategory,
        severity: editSeverity,
      }),
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      alert(errorData.error || "Failed to update complaint details");
      setIsSubmitting(false);
      return;
    }
    
    // Also update status and remarks via the existing server action
    const actionRes = await updateComplaintStatusAction(id, editStatus, editRemarks);
    setIsSubmitting(false);
    if (actionRes.error) {
      alert(actionRes.error);
    } else {
      setEditingId(null);
      router.refresh();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return "var(--danger)";
      case 'UNDER_REVIEW': return "var(--warning)";
      case 'RESOLVED': return "var(--success)";
      default: return "var(--text-secondary)";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'OPEN': return <AlertCircle size={16} />;
      case 'UNDER_REVIEW': return <Clock size={16} />;
      case 'RESOLVED': return <CheckCircle size={16} />;
      default: return <MessageSquare size={16} />;
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1.5rem' }}>
      {complaints.map(complaint => (
        <div key={complaint.id} style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
          
          {/* Header */}
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {complaint.category} • {complaint.severity}
              </span>
              <h3 style={{ margin: '0.5rem 0 0 0', fontSize: '1.25rem', fontWeight: 600 }}>{complaint.title}</h3>
            </div>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              padding: '0.25rem 0.75rem', 
              borderRadius: '12px', 
              background: `color-mix(in srgb, ${getStatusColor(complaint.status)} 10%, transparent)`,
              color: getStatusColor(complaint.status),
              fontSize: '0.75rem',
              fontWeight: 600
            }}>
              {getStatusIcon(complaint.status)} {complaint.status.replace('_', ' ')}
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: 'auto', paddingLeft: '1rem' }}>
              <button onClick={() => startEdit(complaint)} style={{ background: 'transparent', border: 'none', color: "inherit", opacity: 0.7, cursor: 'pointer', padding: 0 }}>
                <Edit2 size={16} />
              </button>
              <button onClick={() => handleDelete(complaint.id)} style={{ background: 'transparent', border: 'none', color: "var(--danger)", cursor: 'pointer', padding: 0 }}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          {/* Details */}
          <div style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
              {complaint.description}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: '8px' }}>
              <div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 0.25rem 0' }}>Reported Student</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                  <UserIcon size={14} color="var(--primary)" /> {complaint.student?.firstName} {complaint.student?.lastName}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{complaint.student?.class?.name}-{complaint.student?.class?.section}</span>
              </div>
              <div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 0.25rem 0' }}>Linked Staff/Teacher</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                  <UserIcon size={14} color="var(--success)" /> {complaint.teacher?.user.name}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 'auto' }}>
              <Calendar size={14} /> Reported on {new Date(complaint.date).toLocaleDateString()}
            </div>
          </div>

          {/* Action / Edit Area */}
          <div style={{ padding: '1.5rem', borderTop: '1px solid var(--border-color)', background: editingId === complaint.id ? 'rgba(79, 70, 229, 0.02)' : 'transparent' }}>
            {editingId === complaint.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.25rem' }}>Title</label>
                  <input 
                    value={editTitle} 
                    onChange={(e) => setEditTitle(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.875rem', background: 'transparent' }}
                  />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.25rem' }}>Category</label>
                    <select 
                      value={editCategory} 
                      onChange={(e) => setEditCategory(e.target.value)}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.875rem', background: 'transparent' }}
                    >
                      <option value="BEHAVIOR">Behavior</option>
                      <option value="ACADEMIC">Academic</option>
                      <option value="ATTENDANCE">Attendance</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.25rem' }}>Severity</label>
                    <select 
                      value={editSeverity} 
                      onChange={(e) => setEditSeverity(e.target.value)}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.875rem', background: 'transparent' }}
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.25rem' }}>Description</label>
                  <textarea 
                    value={editDescription} 
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.875rem', background: 'transparent', resize: 'vertical' }}
                  />
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '0.5rem 0' }} />

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.25rem' }}>Update Status</label>
                  <select 
                    value={editStatus} 
                    onChange={(e) => setEditStatus(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.875rem', background: 'transparent' }}
                  >
                    <option value="OPEN">Open</option>
                    <option value="UNDER_REVIEW">Under Review</option>
                    <option value="RESOLVED">Resolved</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.25rem' }}>Admin Remarks</label>
                  <textarea 
                    value={editRemarks} 
                    onChange={(e) => setEditRemarks(e.target.value)}
                    rows={2}
                    placeholder="Add resolution notes or remarks..."
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.875rem', background: 'transparent', resize: 'vertical' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button onClick={() => setEditingId(null)} style={{ padding: '0.5rem 1rem', background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}>
                    Cancel
                  </button>
                  <button onClick={() => handleUpdate(complaint.id)} disabled={isSubmitting} style={{ padding: '0.5rem 1rem', background: "var(--success)", color: "var(--success-fg)", border: 'none', borderRadius: '6px', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>
                    {isSubmitting ? "Saving..." : "Save Update"}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {complaint.remarks && (
                  <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(79, 70, 229, 0.05)', borderRadius: '6px', borderLeft: '2px solid var(--primary)' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.25rem' }}>Admin Remarks</p>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{complaint.remarks}</p>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => startEdit(complaint)} style={{ flex: 1, padding: '0.75rem', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>
                    Update Status
                  </button>
                  <button 
                    onClick={async () => {
                      const replyMessage = prompt("Enter your reply message. This will be sent as a notification to the reporter.");
                      if (replyMessage && complaint.student?.parents?.[0]?.parent?.userId) {
                        // Assuming we notify the parent of the student who made the complaint. 
                        // Wait, who is the author? The Complaint model has teacherId and studentId. 
                        // In this app, teachers report students. Let's send the reply to the teacher.
                        const res = await fetch(`/api/complaints/${complaint.id}/reply`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ message: replyMessage, recipientUserId: complaint.teacher?.userId })
                        });
                        if (!res.ok) alert("Failed to send reply");
                        else alert("Reply sent successfully.");
                      } else {
                        // If we are calling the server action directly
                        if (replyMessage && complaint.teacher?.userId) {
                          const { replyToComplaintAction } = await import('@/backend/actions/dashboard/admin/complaints/actions');
                          const res = await replyToComplaintAction(complaint.id, replyMessage, complaint.teacher.userId);
                          if (res.error) alert(res.error);
                          else alert("Reply sent successfully.");
                        }
                      }
                    }}
                    style={{ flex: 1, padding: '0.75rem', background: 'var(--primary)', border: 'none', color: "var(--primary-fg)", borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}
                  >
                    Reply
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      {complaints.length === 0 && (
        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <MessageSquare size={48} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
          <p>No complaints or feedback found.</p>
        </div>
      )}
    </div>
  );
}
