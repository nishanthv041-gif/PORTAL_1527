import styles from "../../dashboard.module.css";

export default function AdminStudentsLoading() {
  return (
    <div className={styles.dashboard} style={{ opacity: 0.9 }}>
      {/* Title */}
      <div 
        style={{ 
          height: '32px', 
          width: '280px', 
          borderRadius: '8px', 
          marginBottom: '1.25rem',
          background: 'linear-gradient(90deg, var(--card) 25%, rgba(99, 102, 241, 0.15) 50%, var(--card) 75%)',
          backgroundSize: '200% 100%',
          animation: 'studentSkeletonShimmer 1.4s infinite ease-in-out'
        }} 
      />

      {/* Switcher bar skeleton */}
      <div 
        style={{ 
          height: '46px', 
          width: '100%', 
          maxWidth: '480px', 
          borderRadius: '12px', 
          marginBottom: '1.5rem',
          background: 'var(--card)', 
          border: '1px solid var(--border)',
          opacity: 0.7 
        }} 
      />

      {/* Actions and search bar skeleton */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div 
          style={{ 
            height: '42px', 
            width: '320px', 
            borderRadius: '10px', 
            background: 'var(--card)', 
            border: '1px solid var(--border)',
            opacity: 0.8 
          }} 
        />
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <div style={{ height: '42px', width: '130px', borderRadius: '10px', background: 'var(--card)', opacity: 0.7 }} />
          <div style={{ height: '42px', width: '130px', borderRadius: '10px', background: 'var(--card)', opacity: 0.7 }} />
        </div>
      </div>

      {/* Table rows skeleton */}
      <div 
        style={{ 
          background: 'var(--card)', 
          borderRadius: '14px', 
          border: '1px solid var(--border)', 
          overflow: 'hidden',
          padding: '1rem' 
        }}
      >
        <div style={{ height: '40px', borderBottom: '1px solid var(--border)', marginBottom: '0.75rem', opacity: 0.5, background: 'var(--card)' }} />
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div 
            key={i} 
            style={{ 
              height: '52px', 
              borderRadius: '8px', 
              marginBottom: '0.5rem',
              background: 'linear-gradient(90deg, var(--card) 25%, rgba(99, 102, 241, 0.08) 50%, var(--card) 75%)',
              backgroundSize: '200% 100%',
              animation: 'studentSkeletonShimmer 1.4s infinite ease-in-out'
            }} 
          />
        ))}
      </div>

      <style>{`
        @keyframes studentSkeletonShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
