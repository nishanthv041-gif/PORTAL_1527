import styles from "./dashboard.module.css";

export default function DashboardLoading() {
  return (
    <div className={styles.dashboard} style={{ opacity: 0.9 }}>
      {/* Title Skeleton */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
        <div 
          style={{ 
            height: '28px', 
            width: '240px', 
            maxWidth: '70%',
            borderRadius: '8px', 
            background: 'linear-gradient(90deg, var(--card) 25%, rgba(99, 102, 241, 0.15) 50%, var(--card) 75%)',
            backgroundSize: '200% 100%',
            animation: 'skeletonShimmer 1.4s infinite ease-in-out'
          }} 
        />
        <div 
          style={{ 
            height: '14px', 
            width: '180px', 
            maxWidth: '50%',
            borderRadius: '6px', 
            background: 'var(--card)', 
            opacity: 0.5 
          }} 
        />
      </div>

      {/* Banner Skeleton */}
      <div 
        style={{ 
          height: '130px', 
          width: '100%', 
          borderRadius: '16px', 
          border: '1px solid var(--border)',
          background: 'linear-gradient(90deg, var(--card) 25%, rgba(99, 102, 241, 0.12) 50%, var(--card) 75%)',
          backgroundSize: '200% 100%',
          animation: 'skeletonShimmer 1.4s infinite ease-in-out',
          boxSizing: 'border-box'
        }} 
      />

      {/* Stats Grid Skeleton */}
      <div className={styles.statsGrid}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div 
            key={i} 
            className={styles.statCard} 
            style={{ 
              height: '80px',
              background: 'linear-gradient(90deg, var(--card) 25%, rgba(99, 102, 241, 0.08) 50%, var(--card) 75%)',
              backgroundSize: '200% 100%',
              animation: 'skeletonShimmer 1.4s infinite ease-in-out',
              opacity: 0.75
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes skeletonShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
