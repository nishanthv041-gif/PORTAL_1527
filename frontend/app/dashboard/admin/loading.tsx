import styles from "../dashboard.module.css";

export default function AdminDashboardLoading() {
  return (
    <div className={styles.dashboard} style={{ opacity: 0.9 }}>
      {/* Title & Filter Skeleton */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div 
            style={{ 
              height: '32px', 
              width: '240px', 
              borderRadius: '8px', 
              background: 'linear-gradient(90deg, var(--card) 25%, rgba(99, 102, 241, 0.15) 50%, var(--card) 75%)',
              backgroundSize: '200% 100%',
              animation: 'adminSkeletonShimmer 1.4s infinite ease-in-out'
            }} 
          />
          <div 
            style={{ 
              height: '14px', 
              width: '160px', 
              borderRadius: '6px', 
              background: 'var(--card)', 
              opacity: 0.6 
            }} 
          />
        </div>
        <div 
          style={{ 
            height: '40px', 
            width: '220px', 
            borderRadius: '10px', 
            background: 'var(--card)', 
            border: '1px solid var(--border)',
            opacity: 0.7 
          }} 
        />
      </div>

      {/* Stats Grid Skeleton */}
      <div className={styles.statsGrid}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div 
            key={i} 
            className={styles.statCard} 
            style={{ 
              minHeight: '92px',
              background: 'linear-gradient(90deg, var(--card) 25%, rgba(99, 102, 241, 0.10) 50%, var(--card) 75%)',
              backgroundSize: '200% 100%',
              animation: 'adminSkeletonShimmer 1.4s infinite ease-in-out',
              borderRadius: '14px',
              border: '1px solid var(--border)',
            }}
          />
        ))}
      </div>

      {/* Main Content Skeleton Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginTop: '1.5rem' }}>
        <div 
          style={{ 
            height: '240px', 
            borderRadius: '16px', 
            border: '1px solid var(--border)',
            background: 'linear-gradient(90deg, var(--card) 25%, rgba(99, 102, 241, 0.08) 50%, var(--card) 75%)',
            backgroundSize: '200% 100%',
            animation: 'adminSkeletonShimmer 1.4s infinite ease-in-out'
          }} 
        />
        <div 
          style={{ 
            height: '240px', 
            borderRadius: '16px', 
            border: '1px solid var(--border)',
            background: 'linear-gradient(90deg, var(--card) 25%, rgba(99, 102, 241, 0.08) 50%, var(--card) 75%)',
            backgroundSize: '200% 100%',
            animation: 'adminSkeletonShimmer 1.4s infinite ease-in-out'
          }} 
        />
      </div>

      <style>{`
        @keyframes adminSkeletonShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
