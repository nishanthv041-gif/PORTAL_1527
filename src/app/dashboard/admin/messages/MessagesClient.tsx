"use client";

import { MessageSquare, ArrowRight, Clock, CheckCheck, Check } from "lucide-react";

import { Message, User } from "@prisma/client";

type MessageWithUsers = Message & { sender: User, recipient: User };

export default function MessagesClient({ messages }: { messages: MessageWithUsers[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {messages.map(msg => (
        <div key={msg.id} style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>From:</span>
                <span style={{ fontWeight: 500 }}>{msg.sender.name} <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>({msg.sender.role})</span></span>
              </div>
              <ArrowRight size={16} color="var(--text-secondary)" />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>To:</span>
                <span style={{ fontWeight: 500 }}>{msg.recipient.name} <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>({msg.recipient.role})</span></span>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
              <Clock size={14} /> {new Date(msg.createdAt).toLocaleString()}
            </div>
          </div>

          <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {msg.content}
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: msg.isRead ? "var(--primary)" : 'var(--text-secondary)' }}>
              {msg.isRead ? <><CheckCheck size={14} /> Read</> : <><Check size={14} /> Delivered</>}
            </span>
          </div>
        </div>
      ))}
      
      {messages.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <MessageSquare size={48} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
          <p>No messages have been sent on the platform yet.</p>
        </div>
      )}
    </div>
  );
}
