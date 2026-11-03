import styles from "../../dashboard.module.css";

export default function AdminClassesLoading() {
  return (
    <div className={styles.dashboard} style={{ opacity: 0.9 }}>
      {/* Title */}
      <div 
        style={{ 
          height: '32px', 
          width: '180px', 
          borderRadius: '8px', 
          marginBottom: '1.25rem',
          background: 'linear-gradient(90deg, var(--card) 25%, rgba(99, 102, 241, 0.15) 50%, var(--card) 75%)',
          backgroundSize: '200% 100%',
          animation: 'classSkeletonShimmer 1.4s infinite ease-in-out'
        }} 
      />

      {/* Action button row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ height: '40px', width: '260px', borderRadius: '10px', background: 'var(--card)', border: '1px solid var(--border)' }} />
        <div style={{ height: '40px', width: '150px', borderRadius: '10px', background: 'var(--card)' }} />
      </div>

      {/* Class Grid Skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div 
            key={i} 
            style={{ 
              height: '180px', 
              borderRadius: '16px', 
              border: '1px solid var(--border)',
              background: 'linear-gradient(90deg, var(--card) 25%, rgba(99, 102, 241, 0.08) 50%, var(--card) 75%)',
              backgroundSize: '200% 100%',
              animation: 'classSkeletonShimmer 1.4s infinite ease-in-out'
            }} 
          />
        ))}
      </div>

      <style>{`
        @keyframes classSkeletonShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
