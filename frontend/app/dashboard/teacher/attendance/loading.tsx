import styles from "../../dashboard.module.css";

export default function TeacherAttendanceLoading() {
  return (
    <div className={styles.dashboard} style={{ opacity: 0.9 }}>
      {/* Title */}
      <div 
        style={{ 
          height: '32px', 
          width: '260px', 
          borderRadius: '8px', 
          marginBottom: '1.25rem',
          background: 'linear-gradient(90deg, var(--card) 25%, rgba(99, 102, 241, 0.15) 50%, var(--card) 75%)',
          backgroundSize: '200% 100%',
          animation: 'attSkeletonShimmer 1.4s infinite ease-in-out'
        }} 
      />

      {/* Date selector and class tab strip */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ height: '42px', width: '200px', borderRadius: '10px', background: 'var(--card)', border: '1px solid var(--border)' }} />
        <div style={{ height: '42px', width: '160px', borderRadius: '10px', background: 'var(--card)' }} />
      </div>

      {/* Teacher personal status card */}
      <div 
        style={{ 
          height: '90px', 
          borderRadius: '14px', 
          border: '1px solid var(--border)',
          marginBottom: '1.5rem',
          background: 'var(--card)' 
        }} 
      />

      {/* Student attendance list table skeleton */}
      <div 
        style={{ 
          background: 'var(--card)', 
          borderRadius: '14px', 
          border: '1px solid var(--border)', 
          padding: '1rem' 
        }}
      >
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div 
            key={i} 
            style={{ 
              height: '48px', 
              borderRadius: '8px', 
              marginBottom: '0.5rem',
              background: 'linear-gradient(90deg, var(--card) 25%, rgba(99, 102, 241, 0.08) 50%, var(--card) 75%)',
              backgroundSize: '200% 100%',
              animation: 'attSkeletonShimmer 1.4s infinite ease-in-out'
            }} 
          />
        ))}
      </div>

      <style>{`
        @keyframes attSkeletonShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
